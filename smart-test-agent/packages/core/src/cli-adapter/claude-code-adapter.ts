/**
 * Claude Code CLI Adapter
 * Wraps Claude Code CLI invocations with degradation support
 * @see Requirements 16.3, 16.4
 */

import { spawn } from 'child_process';
import type { ClaudeCodeCapabilities, DegradationDecision } from '@smart-test-agent/shared';

/**
 * Parameters for Claude Code invocation
 */
export interface ClaudeCodeParams {
  /** The prompt to send to Claude Code */
  prompt: string;
  /** Working directory for the command */
  workingDir?: string;
  /** Allowed tools (if supported) */
  allowedTools?: string[];
  /** Output format preference */
  outputFormat?: 'json' | 'stream-json' | 'text';
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Additional CLI arguments */
  additionalArgs?: string[];
  /** Callback for real-time log output */
  onLog?: (type: 'stdout' | 'stderr' | 'info', message: string) => void;
}

/**
 * Result from Claude Code invocation
 */
export interface ClaudeCodeResult {
  /** Whether the invocation succeeded */
  success: boolean;
  /** Output from Claude Code (extracted result for processing) */
  output: string;
  /** Raw output from Claude Code (full stream-json for debugging) */
  rawOutput?: string;
  /** Parsed JSON output (if applicable) */
  parsedOutput?: unknown;
  /** Error message if failed */
  error?: string;
  /** Exit code */
  exitCode: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Degradation decisions made */
  degradations: DegradationDecision[];
}

/** Default timeout (15 minutes for complex PRD parsing) */
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

/** Tool name mapping for Chinese display */
const TOOL_NAME_MAP: Record<string, string> = {
  'Read': '📖 读取文件',
  'Write': '✏️ 写入文件',
  'Edit': '📝 编辑文件',
  'Bash': '💻 执行命令',
  'Glob': '🔍 搜索文件',
  'Grep': '🔎 搜索内容',
  'LS': '📂 列出目录',
  'TodoRead': '📋 读取任务',
  'TodoWrite': '📝 写入任务',
  'WebFetch': '🌐 获取网页',
  'WebSearch': '🔍 搜索网页',
};

/**
 * Claude Code CLI Adapter
 */
export class ClaudeCodeAdapter {
  private capabilities: ClaudeCodeCapabilities;
  private degradations: DegradationDecision[] = [];

  constructor(capabilities: ClaudeCodeCapabilities) {
    this.capabilities = capabilities;
  }

  /**
   * Invokes Claude Code CLI
   * @param params Invocation parameters
   * @returns Invocation result
   * @see Requirements 16.3, 16.4
   */
  async invoke(params: ClaudeCodeParams): Promise<ClaudeCodeResult> {
    const startTime = Date.now();
    this.degradations = [];

    const args = this.buildArgs(params);
    const timeout = params.timeoutMs || DEFAULT_TIMEOUT;

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      const onLog = params.onLog;

      // Add --dangerously-skip-permissions to bypass permission prompts
      // Add --verbose for stream-json output format
      const fullArgs = ['--dangerously-skip-permissions', '--verbose', ...args];
      
      // Build command with shell initialization to load environment variables from ~/.zshrc
      const claudeCmd = `source ~/.zshrc 2>/dev/null; claude ${fullArgs.map(arg => `"${arg}"`).join(' ')}`;
      
      onLog?.('info', `🚀 启动 Claude Code CLI (超时: ${Math.round(timeout / 1000)}秒)...`);
      
      const proc = spawn('zsh', ['-c', claudeCmd], {
        cwd: params.workingDir,
        timeout,
      });

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Parse stream-json format for real-time updates
        const lines = chunk.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            this.handleStreamEvent(event, onLog);
          } catch {
            // Not JSON line, skip
          }
        }
      });

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        onLog?.('stderr', chunk);
      });

      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? -1;

        onLog?.('info', `⏹️ Claude Code CLI 退出 (代码: ${exitCode}, 耗时: ${Math.round(durationMs / 1000)}秒)`);

        // Check for authentication errors in output (CLI may return 0 but with error message)
        const authErrorPatterns = [
          'Not logged in',
          'Please run /login',
          'Authentication required',
          'API key not found',
        ];
        const hasAuthError = authErrorPatterns.some(pattern => 
          output.includes(pattern) || errorOutput.includes(pattern)
        );

        // Parse stream-json output to extract final result
        let finalResult: any = null;
        let hasJsonError = false;
        const outputLines = output.split('\n').filter(l => l.trim());
        
        for (const l of outputLines) {
          try {
            const event = JSON.parse(l);
            if (event.type === 'result') {
              finalResult = event;
              if (event.is_error === true) {
                hasJsonError = true;
              }
            }
          } catch {
            // Not JSON line, skip
          }
        }

        // Check for timeout (SIGTERM = 143)
        const isTimeout = exitCode === 143;

        if (exitCode === 0 && !hasAuthError && !hasJsonError) {
          let resultOutput = output;
          if (finalResult && finalResult.result) {
            resultOutput = finalResult.result;
          }
          
          const parsedOutput = this.tryParseJson(resultOutput);
          resolve({
            success: true,
            output: resultOutput,
            rawOutput: output,
            parsedOutput,
            exitCode,
            durationMs,
            degradations: this.degradations,
          });
        } else {
          let errorMsg: string;
          if (isTimeout) {
            errorMsg = `Claude Code CLI 超时 (${Math.round(durationMs / 1000)}秒)，请考虑增加超时时间或简化任务`;
          } else if (hasAuthError) {
            errorMsg = 'Claude Code CLI 认证错误: 请运行 "claude /login" 进行认证';
          } else if (hasJsonError) {
            errorMsg = `Claude Code CLI 返回错误: ${this.extractErrorMessage(output)}`;
          } else {
            errorMsg = errorOutput || `进程退出代码: ${exitCode}`;
          }
          
          onLog?.('stderr', `❌ 错误: ${errorMsg}`);
          
          resolve({
            success: false,
            output,
            error: errorMsg,
            exitCode: hasAuthError || hasJsonError ? -2 : exitCode,
            durationMs,
            degradations: this.degradations,
          });
        }
      });

      proc.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          output,
          error: err.message,
          exitCode: -1,
          durationMs,
          degradations: this.degradations,
        });
      });

      // Send prompt to stdin
      if (proc.stdin) {
        proc.stdin.write(params.prompt);
        proc.stdin.end();
      }
    });
  }

  /**
   * Handles stream-json events and formats them for display
   */
  private handleStreamEvent(
    event: any,
    onLog?: (type: 'stdout' | 'stderr' | 'info', message: string) => void
  ): void {
    if (event.type === 'system') {
      // System initialization message
      const subtypeMap: Record<string, string> = {
        'init': '🔄 系统初始化中...',
        'initialized': '✅ 系统初始化完成',
      };
      onLog?.('info', subtypeMap[event.subtype] || `🔄 系统: ${event.subtype || '就绪'}`);
    } else if (event.type === 'assistant') {
      // Assistant message with content
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const text = item.text.trim();
            if (text.length > 0) {
              // Truncate long text for display
              const displayText = text.length > 500 ? text.substring(0, 500) + '...' : text;
              onLog?.('stdout', `💬 ${displayText}`);
            }
          } else if (item.type === 'tool_use') {
            // Tool invocation - show in readable format
            const toolDisplay = TOOL_NAME_MAP[item.name] || `🔧 ${item.name}`;
            
            // Format tool input for display
            let inputDisplay = '';
            if (item.input) {
              if (item.input.file_path) {
                inputDisplay = `: ${item.input.file_path}`;
              } else if (item.input.command) {
                const cmd = item.input.command;
                inputDisplay = `: ${cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd}`;
              } else if (item.input.pattern) {
                inputDisplay = `: ${item.input.pattern}`;
              } else if (item.input.path) {
                inputDisplay = `: ${item.input.path}`;
              }
            }
            onLog?.('stdout', `${toolDisplay}${inputDisplay}`);
          }
        }
      }
    } else if (event.type === 'user') {
      // Tool result from user
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'tool_result') {
            const isError = item.is_error;
            if (isError) {
              // Show error details
              const errorMsg = typeof item.content === 'string' 
                ? item.content.substring(0, 200) 
                : JSON.stringify(item.content).substring(0, 200);
              onLog?.('stderr', `❌ 执行失败: ${errorMsg}`);
            } else {
              // Just show success indicator
              onLog?.('stdout', `✅ 执行成功`);
            }
          }
        }
      }
    } else if (event.type === 'result') {
      // Final result
      const statusMap: Record<string, string> = {
        'success': '✅ 任务完成',
        'error': '❌ 任务失败',
        'interrupted': '⚠️ 任务中断',
      };
      const status = statusMap[event.subtype] || '📋 任务结束';
      const duration = event.duration_ms ? `${Math.round(event.duration_ms / 1000)}秒` : '';
      const cost = event.total_cost_usd ? `$${event.total_cost_usd.toFixed(4)}` : '';
      const details = [duration, cost].filter(Boolean).join(', ');
      onLog?.('info', `${status}${details ? ` (${details})` : ''}`);
    }
  }

  /**
   * Builds CLI arguments with degradation support
   */
  private buildArgs(params: ClaudeCodeParams): string[] {
    const args: string[] = [];

    // Output format with degradation
    if (params.outputFormat === 'stream-json') {
      if (this.capabilities.supportsStreamJson) {
        args.push('--output-format', 'stream-json');
      } else {
        args.push('--output-format', 'json');
        this.recordDegradation(
          'output-format',
          'stream-json',
          'json',
          'stream-json not supported'
        );
      }
    } else if (params.outputFormat === 'json') {
      args.push('--output-format', 'json');
    }

    // Allowed tools with degradation
    if (params.allowedTools && params.allowedTools.length > 0) {
      if (this.capabilities.supportsAllowedTools) {
        args.push('--allowedTools', params.allowedTools.join(','));
      } else {
        this.recordDegradation(
          'allowed-tools',
          'cli-restriction',
          'prompt-constraint',
          'allowedTools not supported'
        );
      }
    }

    // Add any additional arguments
    if (params.additionalArgs) {
      args.push(...params.additionalArgs);
    }

    // Add prompt flag
    args.push('-p');

    return args;
  }

  /**
   * Records a degradation decision
   */
  private recordDegradation(
    feature: string,
    originalMode: string,
    fallbackMode: string,
    reason: string
  ): void {
    this.degradations.push({
      feature,
      originalMode,
      fallbackMode,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Extracts error message from JSON output
   */
  private extractErrorMessage(output: string): string {
    try {
      const parsed = JSON.parse(output);
      if (parsed && typeof parsed === 'object') {
        return parsed.result || parsed.error || parsed.message || 'Unknown error';
      }
    } catch {
      // Not JSON
    }
    return output.substring(0, 200);
  }

  /**
   * Attempts to parse output as JSON
   */
  private tryParseJson(output: string): unknown | undefined {
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      const arrayMatch = output.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Gets the degradation decisions made during the last invocation
   */
  getDegradations(): DegradationDecision[] {
    return [...this.degradations];
  }
}

/**
 * Codex CLI Adapter
 * Wraps Codex CLI invocations with degradation support
 * @see Requirements 16.3, 16.4
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CodexCapabilities, DegradationDecision } from '@smart-test-agent/shared';

/**
 * Parameters for Codex invocation
 */
export interface CodexParams {
  /** The prompt to send to Codex */
  prompt: string;
  /** Working directory for the command */
  workingDir?: string;
  /** Whether to use suggest mode */
  suggestMode?: boolean;
  /** Output schema for structured output */
  outputSchema?: object;
  /** Image paths to include */
  imagePaths?: string[];
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Additional CLI arguments */
  additionalArgs?: string[];
  /** Callback for real-time log output */
  onLog?: (type: 'stdout' | 'stderr' | 'info', message: string) => void;
}

/**
 * Result from Codex invocation
 */
export interface CodexResult {
  /** Whether the invocation succeeded */
  success: boolean;
  /** Output from Codex */
  output: string;
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

/** Default timeout (15 minutes) */
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

/**
 * Codex CLI Adapter
 */
export class CodexAdapter {
  private capabilities: CodexCapabilities;
  private degradations: DegradationDecision[] = [];

  constructor(capabilities: CodexCapabilities) {
    this.capabilities = capabilities;
  }

  /**
   * Invokes Codex CLI
   * @param params Invocation parameters
   * @returns Invocation result
   * @see Requirements 16.3, 16.4
   */
  async invoke(params: CodexParams): Promise<CodexResult> {
    const startTime = Date.now();
    this.degradations = [];

    const args = await this.buildArgs(params);
    const timeout = params.timeoutMs || DEFAULT_TIMEOUT;

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      const onLog = params.onLog;

      // Build command with shell initialization to load environment variables from ~/.zshrc
      const codexCmd = `source ~/.zshrc 2>/dev/null; codex ${args.map(arg => `"${arg}"`).join(' ')}`;

      onLog?.('info', `🚀 启动 Codex CLI (超时: ${Math.round(timeout / 1000)}秒)...`);

      const proc = spawn('zsh', ['-c', codexCmd], {
        cwd: params.workingDir,
        timeout,
      });

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Parse output for real-time updates
        const lines = chunk.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'message' && event.content) {
              const content = event.content;
              const displayContent = content.length > 300 ? content.substring(0, 300) + '...' : content;
              onLog?.('stdout', `💬 ${displayContent}`);
            } else if (event.type === 'result') {
              const statusMap: Record<string, string> = {
                'success': '✅ 审核完成',
                'error': '❌ 审核失败',
              };
              const status = statusMap[event.subtype] || '📋 审核结束';
              onLog?.('info', status);
            }
          } catch {
            // Not JSON line, log raw if meaningful
            if (line.length > 0 && line.length < 500) {
              onLog?.('stdout', `📝 ${line}`);
            }
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

        onLog?.('info', `⏹️ Codex CLI 退出 (代码: ${exitCode}, 耗时: ${Math.round(durationMs / 1000)}秒)`);

        // Check for authentication errors in output
        const authErrorPatterns = [
          'Not logged in',
          'Please run /login',
          'Authentication required',
          'API key not found',
        ];
        const hasAuthError = authErrorPatterns.some(pattern => 
          output.includes(pattern) || errorOutput.includes(pattern)
        );

        // Check for is_error flag in JSON output
        let hasJsonError = false;
        try {
          const parsed = JSON.parse(output);
          if (parsed && typeof parsed === 'object' && parsed.is_error === true) {
            hasJsonError = true;
          }
        } catch {
          // Not JSON, ignore
        }

        // Check for timeout (SIGTERM = 143)
        const isTimeout = exitCode === 143;

        if (exitCode === 0 && !hasAuthError && !hasJsonError) {
          const parsedOutput = this.tryParseJson(output);
          resolve({
            success: true,
            output,
            parsedOutput,
            exitCode,
            durationMs,
            degradations: this.degradations,
          });
        } else {
          let errorMsg: string;
          if (isTimeout) {
            errorMsg = `Codex CLI 超时 (${Math.round(durationMs / 1000)}秒)，请考虑增加超时时间或简化任务`;
          } else if (hasAuthError) {
            errorMsg = 'Codex CLI 认证错误: 请先进行认证';
          } else if (hasJsonError) {
            errorMsg = `Codex CLI 返回错误: ${this.extractErrorMessage(output)}`;
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
   * Builds CLI arguments with degradation support
   */
  private async buildArgs(params: CodexParams): Promise<string[]> {
    const args: string[] = [];

    // Suggest mode with degradation
    if (params.suggestMode) {
      if (this.capabilities.supportsSuggestMode) {
        args.push('--approval-mode', 'suggest');
      } else {
        this.recordDegradation(
          'suggest-mode',
          'cli-suggest',
          'manual-interpretation',
          'suggest-mode not supported'
        );
      }
    }

    // Output schema with degradation
    if (params.outputSchema) {
      if (this.capabilities.supportsOutputSchema) {
        const schemaPath = await this.writeSchemaToTemp(params.outputSchema);
        args.push('--output-schema', schemaPath);
      } else {
        this.recordDegradation(
          'output-schema',
          'cli-schema',
          'prompt-instruction',
          'output-schema not supported'
        );
      }
    }

    // Image inputs
    if (params.imagePaths && params.imagePaths.length > 0) {
      for (const imagePath of params.imagePaths) {
        args.push('--image', imagePath);
      }
    }

    // Add any additional arguments
    if (params.additionalArgs) {
      args.push(...params.additionalArgs);
    }

    return args;
  }

  /**
   * Writes output schema to a temporary file
   */
  private async writeSchemaToTemp(schema: object): Promise<string> {
    const tempDir = os.tmpdir();
    const schemaPath = path.join(tempDir, `codex-schema-${Date.now()}.json`);
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));
    return schemaPath;
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

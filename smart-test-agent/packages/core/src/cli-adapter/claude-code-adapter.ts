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
      
      onLog?.('info', `Starting Claude Code CLI with timeout ${timeout}ms...`);
      
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
            // Extract meaningful info from Claude Code stream-json events
            // See: https://docs.anthropic.com/en/docs/build-with-claude/computer-use#stream-json-format
            
            if (event.type === 'system') {
              // System initialization message
              onLog?.('info', `[System] ${event.subtype || 'initialized'}`);
            } else if (event.type === 'assistant') {
              // Assistant message with content
              const content = event.message?.content;
              if (Array.isArray(content)) {
                for (const item of content) {
                  if (item.type === 'text' && item.text) {
                    // Truncate long text for display
                    const text = item.text.trim();
                    if (text.length > 0) {
                      onLog?.('stdout', text.length > 300 ? text.substring(0, 300) + '...' : text);
                    }
                  } else if (item.type === 'tool_use') {
                    // Tool invocation
                    const toolInput = item.input ? JSON.stringify(item.input).substring(0, 100) : '';
                    onLog?.('stdout', `🔧 Tool: ${item.name}${toolInput ? ` (${toolInput}...)` : ''}`);
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
                    const resultPreview = typeof item.content === 'string' 
                      ? item.content.substring(0, 100) 
                      : JSON.stringify(item.content).substring(0, 100);
                    onLog?.(isError ? 'stderr' : 'stdout', `${isError ? '❌' : '✅'} Tool result: ${resultPreview}...`);
                  }
                }
              }
            } else if (event.type === 'result') {
              // Final result
              const status = event.subtype === 'success' ? '✅' : event.subtype === 'error' ? '❌' : '📋';
              onLog?.('info', `${status} Result: ${event.subtype || 'completed'} (${event.duration_ms || 0}ms, cost: $${event.total_cost_usd?.toFixed(4) || '0'})`);
            }
          } catch {
            // Not JSON line, might be raw output - skip unless meaningful
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

        onLog?.('info', `Claude Code CLI exited with code ${exitCode} after ${durationMs}ms`);

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
        // Keep full output for debugging, but extract result for processing
        let finalResult: any = null;
        let hasJsonError = false;
        const lines = output.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
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
          // Extract the actual result content from stream-json for processing
          // But keep rawOutput with full stream for debugging
          let resultOutput = output;
          if (finalResult && finalResult.result) {
            resultOutput = finalResult.result;
          }
          
          const parsedOutput = this.tryParseJson(resultOutput);
          resolve({
            success: true,
            output: resultOutput,  // The extracted result for processing
            rawOutput: output,     // Full stream-json output for debugging
            parsedOutput,
            exitCode,
            durationMs,
            degradations: this.degradations,
          });
        } else {
          let errorMsg: string;
          if (isTimeout) {
            errorMsg = `Claude Code CLI timed out after ${Math.round(durationMs / 1000)}s. Consider increasing timeout or simplifying the task.`;
          } else if (hasAuthError) {
            errorMsg = 'Claude Code CLI authentication error: Please run "claude /login" to authenticate';
          } else if (hasJsonError) {
            errorMsg = `Claude Code CLI returned error: ${this.extractErrorMessage(output)}`;
          } else {
            errorMsg = errorOutput || `Process exited with code ${exitCode}`;
          }
          
          onLog?.('info', `Error: ${errorMsg}`);
          
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
  private buildArgs(params: ClaudeCodeParams): string[] {
    const args: string[] = [];

    // Output format with degradation
    if (params.outputFormat === 'stream-json') {
      if (this.capabilities.supportsStreamJson) {
        args.push('--output-format', 'stream-json');
      } else {
        // Degrade to json
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
        // Degrade to prompt constraints (no CLI flag)
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
      // Try to find JSON in output (may have other text)
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Try array
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

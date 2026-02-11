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
}

/**
 * Result from Claude Code invocation
 */
export interface ClaudeCodeResult {
  /** Whether the invocation succeeded */
  success: boolean;
  /** Output from Claude Code */
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

/** Default timeout (5 minutes) */
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

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

      const proc = spawn('claude', args, {
        cwd: params.workingDir,
        timeout,
        shell: true,
      });

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? -1;

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
          const errorMsg = hasAuthError 
            ? 'Claude Code CLI authentication error: Please run "claude /login" to authenticate'
            : hasJsonError
            ? `Claude Code CLI returned error: ${this.extractErrorMessage(output)}`
            : errorOutput || `Process exited with code ${exitCode}`;
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

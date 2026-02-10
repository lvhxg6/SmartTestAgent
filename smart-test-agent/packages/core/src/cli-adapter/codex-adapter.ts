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

/** Default timeout (5 minutes) */
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

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

      const proc = spawn('codex', args, {
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

        if (exitCode === 0) {
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
          resolve({
            success: false,
            output,
            error: errorOutput || `Process exited with code ${exitCode}`,
            exitCode,
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
        // Degrade to manual interpretation
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
        // Write schema to temp file
        const schemaPath = await this.writeSchemaToTemp(params.outputSchema);
        args.push('--output-schema', schemaPath);
      } else {
        // Degrade to prompt-based schema instruction
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
   * Attempts to parse output as JSON
   */
  private tryParseJson(output: string): unknown | undefined {
    try {
      // Try to find JSON in output
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

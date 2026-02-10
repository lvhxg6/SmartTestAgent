/**
 * Playwright Script Executor
 * Executes generated Playwright test scripts via node command
 * @see Requirements 7.3, 7.4, 7.5, 7.7
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ExecutionResult, Screenshot, ReasonCode } from '@smart-test-agent/shared';

/**
 * Execution options
 */
export interface ExecutionOptions {
  /** Working directory for script execution */
  workingDir: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Execution response
 */
export interface ExecutionResponse {
  success: boolean;
  result?: ExecutionResult;
  error?: string;
  reasonCode?: ReasonCode;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Execute a Playwright test script
 * @see Requirements 7.3, 7.4, 7.5
 */
export async function executeScript(
  scriptPath: string,
  options: ExecutionOptions
): Promise<ExecutionResponse> {
  const { workingDir, timeout = 300000, env = {} } = options;

  // Validate script exists
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `Script not found: ${scriptPath}`,
      reasonCode: 'internal_error',
      stdout: '',
      stderr: '',
      exitCode: null,
    };
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Spawn node process to execute the script
    const child = spawn('node', [scriptPath], {
      cwd: workingDir,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    // Collect stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process exit
    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          success: false,
          error: `Script execution timed out after ${timeout}ms`,
          reasonCode: 'agent_timeout',
          stdout,
          stderr,
          exitCode: code,
        });
        return;
      }

      // Try to read execution results
      const resultsPath = path.join(workingDir, 'execution-results.json');
      let result: ExecutionResult | undefined;

      if (fs.existsSync(resultsPath)) {
        try {
          const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
          result = JSON.parse(resultsContent) as ExecutionResult;
        } catch (parseError) {
          // Results file exists but couldn't be parsed
          stderr += `\nFailed to parse execution results: ${parseError}`;
        }
      }

      const success = code === 0 && result?.success === true;

      resolve({
        success,
        result,
        error: success ? undefined : stderr || `Script exited with code ${code}`,
        reasonCode: success ? undefined : 'playwright_error',
        stdout,
        stderr,
        exitCode: code,
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `Failed to spawn script process: ${error.message}`,
        reasonCode: 'internal_error',
        stdout,
        stderr,
        exitCode: null,
      });
    });
  });
}

/**
 * Collect screenshots from a directory
 * @see Requirements 7.4
 */
export function collectScreenshots(screenshotDir: string, runId: string): Screenshot[] {
  const screenshots: Screenshot[] = [];

  if (!fs.existsSync(screenshotDir)) {
    return screenshots;
  }

  const files = fs.readdirSync(screenshotDir);

  for (const file of files) {
    if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) {
      continue;
    }

    // Parse filename to extract metadata
    // Expected format: {caseId}-step{stepNumber}-{timestamp}.png
    const match = file.match(/^(.+)-step(\d+)-(\d+)\.(png|jpe?g)$/);

    if (match) {
      const [, caseId, stepNumber, timestamp] = match;
      screenshots.push({
        id: `${runId}-${caseId}-${stepNumber}`,
        caseId,
        stepNumber: parseInt(stepNumber, 10),
        path: path.join(screenshotDir, file),
        timestamp: new Date(parseInt(timestamp, 10)).toISOString(),
      });
    }
  }

  // Sort by case ID and step number
  screenshots.sort((a, b) => {
    if (a.caseId !== b.caseId) {
      return a.caseId.localeCompare(b.caseId);
    }
    return a.stepNumber - b.stepNumber;
  });

  return screenshots;
}

/**
 * Parse Playwright error to extract reason code
 * @see Requirements 7.7
 */
export function parsePlaywrightError(error: string): {
  reasonCode: ReasonCode;
  details: string;
} {
  const errorLower = error.toLowerCase();

  // Element not found errors
  if (
    errorLower.includes('element not found') ||
    errorLower.includes('no element matches') ||
    errorLower.includes('locator resolved to') ||
    errorLower.includes('waiting for selector')
  ) {
    return {
      reasonCode: 'playwright_error',
      details: 'Element not found or selector mismatch',
    };
  }

  // Timeout errors
  if (
    errorLower.includes('timeout') ||
    errorLower.includes('exceeded') ||
    errorLower.includes('timed out')
  ) {
    return {
      reasonCode: 'agent_timeout',
      details: 'Operation timed out',
    };
  }

  // Navigation errors
  if (
    errorLower.includes('navigation') ||
    errorLower.includes('net::err') ||
    errorLower.includes('failed to load')
  ) {
    return {
      reasonCode: 'playwright_error',
      details: 'Navigation or network error',
    };
  }

  // Default to playwright error
  return {
    reasonCode: 'playwright_error',
    details: error.substring(0, 200),
  };
}

/**
 * Ensure workspace directories exist
 */
export function ensureWorkspaceDirectories(workspacePath: string): {
  screenshotDir: string;
  traceDir: string;
  outputDir: string;
} {
  const screenshotDir = path.join(workspacePath, 'evidence', 'screenshots');
  const traceDir = path.join(workspacePath, 'evidence', 'traces');
  const outputDir = workspacePath;

  // Create directories if they don't exist
  for (const dir of [screenshotDir, traceDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return { screenshotDir, traceDir, outputDir };
}

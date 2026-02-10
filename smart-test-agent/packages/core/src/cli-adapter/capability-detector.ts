/**
 * CLI Capability Detector
 * Probes CLI tools to detect supported features
 * @see Requirements 16.1, 16.2
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  CliCapabilities,
  ClaudeCodeCapabilities,
  CodexCapabilities,
} from '@smart-test-agent/shared';

const execAsync = promisify(exec);

/** Default timeout for CLI probing (5 seconds) */
const PROBE_TIMEOUT = 5000;

/**
 * Parses version string from CLI help output
 */
function parseVersion(output: string): string {
  // Try common version patterns
  const patterns = [
    /version[:\s]+([0-9]+\.[0-9]+\.[0-9]+)/i,
    /v([0-9]+\.[0-9]+\.[0-9]+)/,
    /([0-9]+\.[0-9]+\.[0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return 'unknown';
}

/**
 * Checks if a specific feature is mentioned in help output
 */
function hasFeature(output: string, feature: string): boolean {
  return output.toLowerCase().includes(feature.toLowerCase());
}

/**
 * Probes Claude Code CLI capabilities
 * @see Requirements 16.1, 16.2
 */
export async function probeClaudeCodeCapabilities(): Promise<ClaudeCodeCapabilities> {
  const defaultCapabilities: ClaudeCodeCapabilities = {
    supportsStreamJson: false,
    supportsAllowedTools: false,
    version: 'not_installed',
  };

  try {
    // Try to get help output
    const { stdout, stderr } = await execAsync('claude --help', {
      timeout: PROBE_TIMEOUT,
    });

    const output = stdout + stderr;

    return {
      supportsStreamJson: hasFeature(output, 'stream-json') || hasFeature(output, 'output-format'),
      supportsAllowedTools: hasFeature(output, 'allowed-tools') || hasFeature(output, 'allowedTools'),
      version: parseVersion(output),
    };
  } catch (error) {
    // CLI not installed or not accessible
    return defaultCapabilities;
  }
}

/**
 * Probes Codex CLI capabilities
 * @see Requirements 16.1, 16.2
 */
export async function probeCodexCapabilities(): Promise<CodexCapabilities> {
  const defaultCapabilities: CodexCapabilities = {
    supportsSuggestMode: false,
    supportsOutputSchema: false,
    version: 'not_installed',
  };

  try {
    // Try to get help output
    const { stdout, stderr } = await execAsync('codex --help', {
      timeout: PROBE_TIMEOUT,
    });

    const output = stdout + stderr;

    return {
      supportsSuggestMode: hasFeature(output, 'suggest') || hasFeature(output, 'approval-mode'),
      supportsOutputSchema: hasFeature(output, 'output-schema') || hasFeature(output, 'schema'),
      version: parseVersion(output),
    };
  } catch (error) {
    // CLI not installed or not accessible
    return defaultCapabilities;
  }
}

/**
 * Probes all CLI capabilities
 * @returns Combined CLI capabilities
 * @see Requirements 16.1, 16.2
 */
export async function probeAllCapabilities(): Promise<CliCapabilities> {
  const [claudeCode, codex] = await Promise.all([
    probeClaudeCodeCapabilities(),
    probeCodexCapabilities(),
  ]);

  return {
    claudeCode,
    codex,
  };
}

/**
 * Checks if Claude Code CLI is available
 */
export async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    await execAsync('claude --version', { timeout: PROBE_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if Codex CLI is available
 */
export async function isCodexAvailable(): Promise<boolean> {
  try {
    await execAsync('codex --version', { timeout: PROBE_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

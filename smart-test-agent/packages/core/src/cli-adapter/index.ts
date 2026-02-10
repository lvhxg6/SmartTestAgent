/**
 * CLI Adapter Module
 * Provides unified interface for Claude Code and Codex CLI tools
 * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

import type {
  CliCapabilities,
  DegradationDecision,
} from '@smart-test-agent/shared';

// Re-export sub-modules
export * from './capability-detector.js';
export * from './claude-code-adapter.js';
export * from './codex-adapter.js';

import {
  probeAllCapabilities,
  probeClaudeCodeCapabilities,
  probeCodexCapabilities,
  isClaudeCodeAvailable,
  isCodexAvailable,
} from './capability-detector.js';
import { ClaudeCodeAdapter, type ClaudeCodeParams, type ClaudeCodeResult } from './claude-code-adapter.js';
import { CodexAdapter, type CodexParams, type CodexResult } from './codex-adapter.js';

/**
 * Unified CLI Adapter
 * Manages both Claude Code and Codex CLI adapters
 */
export class CliAdapter {
  private capabilities: CliCapabilities | null = null;
  private claudeCodeAdapter: ClaudeCodeAdapter | null = null;
  private codexAdapter: CodexAdapter | null = null;
  private allDegradations: DegradationDecision[] = [];

  /**
   * Probes and initializes CLI capabilities
   * @returns Detected capabilities
   * @see Requirements 16.1, 16.2
   */
  async probeCapabilities(): Promise<CliCapabilities> {
    this.capabilities = await probeAllCapabilities();

    // Initialize adapters with detected capabilities
    this.claudeCodeAdapter = new ClaudeCodeAdapter(this.capabilities.claudeCode);
    this.codexAdapter = new CodexAdapter(this.capabilities.codex);

    return this.capabilities;
  }

  /**
   * Gets the current capabilities (probes if not yet done)
   */
  async getCapabilities(): Promise<CliCapabilities> {
    if (!this.capabilities) {
      return this.probeCapabilities();
    }
    return this.capabilities;
  }

  /**
   * Invokes Claude Code CLI
   * @param params Invocation parameters
   * @returns Invocation result
   * @see Requirements 16.3, 16.4
   */
  async invokeClaudeCode(params: ClaudeCodeParams): Promise<ClaudeCodeResult> {
    if (!this.claudeCodeAdapter) {
      await this.probeCapabilities();
    }

    const result = await this.claudeCodeAdapter!.invoke(params);

    // Record degradations
    this.allDegradations.push(...result.degradations);

    return result;
  }

  /**
   * Invokes Codex CLI
   * @param params Invocation parameters
   * @returns Invocation result
   * @see Requirements 16.3, 16.4
   */
  async invokeCodex(params: CodexParams): Promise<CodexResult> {
    if (!this.codexAdapter) {
      await this.probeCapabilities();
    }

    const result = await this.codexAdapter!.invoke(params);

    // Record degradations
    this.allDegradations.push(...result.degradations);

    return result;
  }

  /**
   * Gets all degradation decisions made
   * @returns Array of degradation decisions
   * @see Requirements 16.5
   */
  getDegradations(): DegradationDecision[] {
    return [...this.allDegradations];
  }

  /**
   * Clears recorded degradations
   */
  clearDegradations(): void {
    this.allDegradations = [];
  }

  /**
   * Checks if Claude Code is available
   */
  async isClaudeCodeAvailable(): Promise<boolean> {
    return isClaudeCodeAvailable();
  }

  /**
   * Checks if Codex is available
   */
  async isCodexAvailable(): Promise<boolean> {
    return isCodexAvailable();
  }
}

// Default export
export default CliAdapter;

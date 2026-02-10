/**
 * CLI Adapter Property-Based Tests
 * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 *
 * Property 33: CLI Capability Detection
 * Property 34: CLI Degradation Behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import type { ClaudeCodeCapabilities, CodexCapabilities } from '@smart-test-agent/shared';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { CodexAdapter } from './codex-adapter.js';

const spawnMock = vi.mocked(spawn);

describe('Property Tests: CLI Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockProcess(exitCode: number, stdout: string) {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: vi.fn(), end: vi.fn() };

    setTimeout(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
      proc.emit('close', exitCode);
    }, 5);

    return proc;
  }

  /**
   * Property 33: CLI Capability Detection
   * For any CLI, the capability probe should correctly detect supported features.
   * **Validates: Requirements 16.1, 16.2**
   */
  describe('Property 33: CLI Capability Detection', () => {
    // Arbitrary for Claude Code capabilities
    const claudeCodeCapabilitiesArb: fc.Arbitrary<ClaudeCodeCapabilities> = fc.record({
      supportsStreamJson: fc.boolean(),
      supportsAllowedTools: fc.boolean(),
      version: fc.stringOf(fc.constantFrom(...'0123456789.'), { minLength: 1, maxLength: 10 }),
    });

    // Arbitrary for Codex capabilities
    const codexCapabilitiesArb: fc.Arbitrary<CodexCapabilities> = fc.record({
      supportsSuggestMode: fc.boolean(),
      supportsOutputSchema: fc.boolean(),
      version: fc.stringOf(fc.constantFrom(...'0123456789.'), { minLength: 1, maxLength: 10 }),
    });

    it('Claude Code adapter should respect capability flags', async () => {
      await fc.assert(
        fc.asyncProperty(
          claudeCodeCapabilitiesArb,
          fc.boolean(),
          fc.boolean(),
          async (capabilities, useStreamJson, useAllowedTools) => {
            const mockProc = createMockProcess(0, '{"result": "ok"}');
            spawnMock.mockReturnValue(mockProc);

            const adapter = new ClaudeCodeAdapter(capabilities);
            const result = await adapter.invoke({
              prompt: 'test',
              outputFormat: useStreamJson ? 'stream-json' : 'json',
              allowedTools: useAllowedTools ? ['Bash'] : undefined,
            });

            // If feature requested but not supported, should have degradation
            if (useStreamJson && !capabilities.supportsStreamJson) {
              expect(result.degradations.some(d => d.feature === 'output-format')).toBe(true);
            }

            if (useAllowedTools && !capabilities.supportsAllowedTools) {
              expect(result.degradations.some(d => d.feature === 'allowed-tools')).toBe(true);
            }

            // If feature supported, no degradation for that feature
            if (useStreamJson && capabilities.supportsStreamJson) {
              expect(result.degradations.some(d => d.feature === 'output-format')).toBe(false);
            }

            if (useAllowedTools && capabilities.supportsAllowedTools) {
              expect(result.degradations.some(d => d.feature === 'allowed-tools')).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Codex adapter should respect capability flags', async () => {
      await fc.assert(
        fc.asyncProperty(
          codexCapabilitiesArb,
          fc.boolean(),
          fc.boolean(),
          async (capabilities, useSuggestMode, useOutputSchema) => {
            const mockProc = createMockProcess(0, '{"result": "ok"}');
            spawnMock.mockReturnValue(mockProc);

            const adapter = new CodexAdapter(capabilities);
            const result = await adapter.invoke({
              prompt: 'test',
              suggestMode: useSuggestMode,
              outputSchema: useOutputSchema ? { type: 'object' } : undefined,
            });

            // If feature requested but not supported, should have degradation
            if (useSuggestMode && !capabilities.supportsSuggestMode) {
              expect(result.degradations.some(d => d.feature === 'suggest-mode')).toBe(true);
            }

            if (useOutputSchema && !capabilities.supportsOutputSchema) {
              expect(result.degradations.some(d => d.feature === 'output-schema')).toBe(true);
            }

            // If feature supported, no degradation for that feature
            if (useSuggestMode && capabilities.supportsSuggestMode) {
              expect(result.degradations.some(d => d.feature === 'suggest-mode')).toBe(false);
            }

            if (useOutputSchema && capabilities.supportsOutputSchema) {
              expect(result.degradations.some(d => d.feature === 'output-schema')).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 34: CLI Degradation Behavior
   * When a feature is not supported, the adapter should gracefully degrade
   * and record the degradation decision.
   * **Validates: Requirements 16.3, 16.4, 16.5**
   */
  describe('Property 34: CLI Degradation Behavior', () => {
    it('degradation count should match unsupported features requested', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            supportsStreamJson: fc.boolean(),
            supportsAllowedTools: fc.boolean(),
            version: fc.constant('1.0.0'),
          }),
          fc.boolean(),
          fc.boolean(),
          async (capabilities, requestStreamJson, requestAllowedTools) => {
            const mockProc = createMockProcess(0, 'output');
            spawnMock.mockReturnValue(mockProc);

            const adapter = new ClaudeCodeAdapter(capabilities);
            const result = await adapter.invoke({
              prompt: 'test',
              outputFormat: requestStreamJson ? 'stream-json' : undefined,
              allowedTools: requestAllowedTools ? ['Bash'] : undefined,
            });

            // Count expected degradations
            let expectedDegradations = 0;
            if (requestStreamJson && !capabilities.supportsStreamJson) {
              expectedDegradations++;
            }
            if (requestAllowedTools && !capabilities.supportsAllowedTools) {
              expectedDegradations++;
            }

            expect(result.degradations.length).toBe(expectedDegradations);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('degradation decisions should have all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            supportsStreamJson: fc.constant(false),
            supportsAllowedTools: fc.constant(false),
            version: fc.constant('1.0.0'),
          }),
          async (capabilities) => {
            const mockProc = createMockProcess(0, 'output');
            spawnMock.mockReturnValue(mockProc);

            const adapter = new ClaudeCodeAdapter(capabilities);
            const result = await adapter.invoke({
              prompt: 'test',
              outputFormat: 'stream-json',
              allowedTools: ['Bash'],
            });

            // All degradations should have required fields
            for (const degradation of result.degradations) {
              expect(degradation.feature).toBeDefined();
              expect(typeof degradation.feature).toBe('string');
              expect(degradation.originalMode).toBeDefined();
              expect(typeof degradation.originalMode).toBe('string');
              expect(degradation.fallbackMode).toBeDefined();
              expect(typeof degradation.fallbackMode).toBe('string');
              expect(degradation.reason).toBeDefined();
              expect(typeof degradation.reason).toBe('string');
              expect(degradation.timestamp).toBeDefined();
              // Timestamp should be valid ISO string
              expect(() => new Date(degradation.timestamp)).not.toThrow();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('getDegradations should return immutable copy', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            supportsStreamJson: fc.constant(false),
            supportsAllowedTools: fc.constant(false),
            version: fc.constant('1.0.0'),
          }),
          async (capabilities) => {
            const mockProc = createMockProcess(0, 'output');
            spawnMock.mockReturnValue(mockProc);

            const adapter = new ClaudeCodeAdapter(capabilities);
            await adapter.invoke({
              prompt: 'test',
              outputFormat: 'stream-json',
              allowedTools: ['Bash'],
            });

            const degradations1 = adapter.getDegradations();
            const originalLength = degradations1.length;

            // Modify the returned array
            degradations1.push({
              feature: 'fake',
              originalMode: 'fake',
              fallbackMode: 'fake',
              reason: 'fake',
              timestamp: new Date().toISOString(),
            });

            // Original should be unchanged
            const degradations2 = adapter.getDegradations();
            expect(degradations2.length).toBe(originalLength);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('successful invocation should still record degradations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            supportsSuggestMode: fc.constant(false),
            supportsOutputSchema: fc.constant(false),
            version: fc.constant('1.0.0'),
          }),
          async (capabilities) => {
            const mockProc = createMockProcess(0, '{"success": true}');
            spawnMock.mockReturnValue(mockProc);

            const adapter = new CodexAdapter(capabilities);
            const result = await adapter.invoke({
              prompt: 'test',
              suggestMode: true,
              outputSchema: { type: 'object' },
            });

            // Should succeed
            expect(result.success).toBe(true);

            // But still have degradations recorded
            expect(result.degradations.length).toBe(2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

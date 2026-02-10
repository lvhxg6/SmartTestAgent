/**
 * Capability Detector Unit Tests
 * @see Requirements 16.1, 16.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Import after mocking
import {
  probeClaudeCodeCapabilities,
  probeCodexCapabilities,
  probeAllCapabilities,
} from './capability-detector.js';

const execMock = vi.mocked(exec);

describe('Capability Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('probeClaudeCodeCapabilities', () => {
    it('should detect stream-json support', async () => {
      execMock.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        const cb = callback as (error: Error | null, result: { stdout: string; stderr: string }) => void;
        cb(null, {
          stdout: 'claude version 1.2.3\nOptions:\n  --output-format stream-json\n  --allowedTools',
          stderr: '',
        });
        return {} as any;
      });

      const result = await probeClaudeCodeCapabilities();

      expect(result.supportsStreamJson).toBe(true);
      expect(result.supportsAllowedTools).toBe(true);
      expect(result.version).toBe('1.2.3');
    });

    it('should handle CLI not installed', async () => {
      execMock.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        const cb = callback as (error: Error | null, result: { stdout: string; stderr: string }) => void;
        cb(new Error('command not found: claude'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await probeClaudeCodeCapabilities();

      expect(result.supportsStreamJson).toBe(false);
      expect(result.supportsAllowedTools).toBe(false);
      expect(result.version).toBe('not_installed');
    });

    it('should detect version from various formats', async () => {
      const testCases = [
        { output: 'claude v1.0.0', expected: '1.0.0' },
        { output: 'version: 2.3.4', expected: '2.3.4' },
        { output: 'Claude Code 3.2.1', expected: '3.2.1' },
      ];

      for (const { output, expected } of testCases) {
        execMock.mockImplementation((cmd, opts, callback) => {
          if (typeof opts === 'function') {
            callback = opts;
          }
          const cb = callback as (error: Error | null, result: { stdout: string; stderr: string }) => void;
          cb(null, { stdout: output, stderr: '' });
          return {} as any;
        });

        const result = await probeClaudeCodeCapabilities();
        expect(result.version).toBe(expected);
      }
    });
  });

  describe('probeCodexCapabilities', () => {
    it('should detect suggest-mode support', async () => {
      execMock.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        const cb = callback as (error: Error | null, result: { stdout: string; stderr: string }) => void;
        cb(null, {
          stdout: 'codex version 1.0.0\nOptions:\n  --approval-mode suggest\n  --output-schema',
          stderr: '',
        });
        return {} as any;
      });

      const result = await probeCodexCapabilities();

      expect(result.supportsSuggestMode).toBe(true);
      expect(result.supportsOutputSchema).toBe(true);
      expect(result.version).toBe('1.0.0');
    });

    it('should handle CLI not installed', async () => {
      execMock.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        const cb = callback as (error: Error | null, result: { stdout: string; stderr: string }) => void;
        cb(new Error('command not found: codex'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await probeCodexCapabilities();

      expect(result.supportsSuggestMode).toBe(false);
      expect(result.supportsOutputSchema).toBe(false);
      expect(result.version).toBe('not_installed');
    });
  });

  describe('probeAllCapabilities', () => {
    it('should probe both CLIs', async () => {
      let callCount = 0;
      execMock.mockImplementation((cmd, opts, callback) => {
        if (typeof opts === 'function') {
          callback = opts;
        }
        const cb = callback as (error: Error | null, result: { stdout: string; stderr: string }) => void;
        callCount++;

        if ((cmd as string).includes('claude')) {
          cb(null, {
            stdout: 'claude v1.0.0 --output-format stream-json',
            stderr: '',
          });
        } else {
          cb(null, {
            stdout: 'codex v2.0.0 --approval-mode suggest',
            stderr: '',
          });
        }
        return {} as any;
      });

      const result = await probeAllCapabilities();

      expect(result.claudeCode.version).toBe('1.0.0');
      expect(result.codex.version).toBe('2.0.0');
    });
  });
});

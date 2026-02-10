/**
 * Claude Code Adapter Unit Tests
 * @see Requirements 16.3, 16.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import type { ClaudeCodeCapabilities } from '@smart-test-agent/shared';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Import after mocking
import { ClaudeCodeAdapter } from './claude-code-adapter.js';

const spawnMock = vi.mocked(spawn);

describe('Claude Code Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockProcess(exitCode: number, stdout: string, stderr: string = '') {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };

    // Emit data and close after a short delay
    setTimeout(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', exitCode);
    }, 10);

    return proc;
  }

  describe('invoke', () => {
    it('should invoke claude with correct arguments', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: true,
        supportsAllowedTools: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        outputFormat: 'stream-json',
        allowedTools: ['Bash', 'Read'],
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--output-format', 'stream-json', '--allowedTools', 'Bash,Read', '-p']),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it('should degrade stream-json when not supported', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: false,
        supportsAllowedTools: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        outputFormat: 'stream-json',
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--output-format', 'json']),
        expect.any(Object)
      );
      expect(result.degradations).toHaveLength(1);
      expect(result.degradations[0].feature).toBe('output-format');
      expect(result.degradations[0].originalMode).toBe('stream-json');
      expect(result.degradations[0].fallbackMode).toBe('json');
    });

    it('should degrade allowedTools when not supported', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: true,
        supportsAllowedTools: false,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        allowedTools: ['Bash'],
      });

      // Should not include --allowedTools in args
      expect(spawnMock).toHaveBeenCalledWith(
        'claude',
        expect.not.arrayContaining(['--allowedTools']),
        expect.any(Object)
      );
      expect(result.degradations).toHaveLength(1);
      expect(result.degradations[0].feature).toBe('allowed-tools');
    });

    it('should parse JSON output', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: true,
        supportsAllowedTools: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"key": "value", "number": 42}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        outputFormat: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.parsedOutput).toEqual({ key: 'value', number: 42 });
    });

    it('should handle process errors', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: true,
        supportsAllowedTools: true,
        version: '1.0.0',
      };

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = { write: vi.fn(), end: vi.fn() };

      setTimeout(() => {
        proc.emit('error', new Error('Process failed'));
      }, 10);

      spawnMock.mockReturnValue(proc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Process failed');
    });

    it('should handle non-zero exit codes', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: true,
        supportsAllowedTools: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(1, '', 'Error occurred');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('Error occurred');
    });

    it('should send prompt to stdin', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: true,
        supportsAllowedTools: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, 'output');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      await adapter.invoke({
        prompt: 'My test prompt',
      });

      expect(mockProc.stdin.write).toHaveBeenCalledWith('My test prompt');
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });
  });

  describe('getDegradations', () => {
    it('should return copy of degradations', async () => {
      const capabilities: ClaudeCodeCapabilities = {
        supportsStreamJson: false,
        supportsAllowedTools: false,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, 'output');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new ClaudeCodeAdapter(capabilities);
      await adapter.invoke({
        prompt: 'Test',
        outputFormat: 'stream-json',
        allowedTools: ['Bash'],
      });

      const degradations = adapter.getDegradations();
      expect(degradations).toHaveLength(2);

      // Modifying returned array should not affect internal state
      degradations.pop();
      expect(adapter.getDegradations()).toHaveLength(2);
    });
  });
});

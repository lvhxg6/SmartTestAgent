/**
 * Codex Adapter Unit Tests
 * @see Requirements 16.3, 16.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import type { CodexCapabilities } from '@smart-test-agent/shared';

// Mock child_process and fs
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { CodexAdapter } from './codex-adapter.js';

const spawnMock = vi.mocked(spawn);

describe('Codex Adapter', () => {
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

    setTimeout(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', exitCode);
    }, 10);

    return proc;
  }

  describe('invoke', () => {
    it('should invoke codex with suggest mode when supported', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        suggestMode: true,
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--approval-mode', 'suggest']),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it('should degrade suggest-mode when not supported', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: false,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        suggestMode: true,
      });

      // Should not include --approval-mode in args
      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        expect.not.arrayContaining(['--approval-mode']),
        expect.any(Object)
      );
      expect(result.degradations).toHaveLength(1);
      expect(result.degradations[0].feature).toBe('suggest-mode');
    });

    it('should use output-schema when supported', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--output-schema']),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it('should degrade output-schema when not supported', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: false,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"result": "success"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
        outputSchema: { type: 'object' },
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        expect.not.arrayContaining(['--output-schema']),
        expect.any(Object)
      );
      expect(result.degradations).toHaveLength(1);
      expect(result.degradations[0].feature).toBe('output-schema');
    });

    it('should include image paths', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, 'output');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      await adapter.invoke({
        prompt: 'Test prompt',
        imagePaths: ['/path/to/image1.png', '/path/to/image2.png'],
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        expect.arrayContaining(['--image', '/path/to/image1.png', '--image', '/path/to/image2.png']),
        expect.any(Object)
      );
    });

    it('should parse JSON output', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, '{"review_verdict": "agree", "reasoning": "Looks good"}');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(true);
      expect(result.parsedOutput).toEqual({
        review_verdict: 'agree',
        reasoning: 'Looks good',
      });
    });

    it('should handle process errors', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = { write: vi.fn(), end: vi.fn() };

      setTimeout(() => {
        proc.emit('error', new Error('Codex failed'));
      }, 10);

      spawnMock.mockReturnValue(proc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Codex failed');
    });

    it('should handle non-zero exit codes', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(1, '', 'Codex error');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      const result = await adapter.invoke({
        prompt: 'Test prompt',
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should send prompt to stdin', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: true,
        supportsOutputSchema: true,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, 'output');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      await adapter.invoke({
        prompt: 'Review this code',
      });

      expect(mockProc.stdin.write).toHaveBeenCalledWith('Review this code');
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });
  });

  describe('getDegradations', () => {
    it('should return copy of degradations', async () => {
      const capabilities: CodexCapabilities = {
        supportsSuggestMode: false,
        supportsOutputSchema: false,
        version: '1.0.0',
      };

      const mockProc = createMockProcess(0, 'output');
      spawnMock.mockReturnValue(mockProc);

      const adapter = new CodexAdapter(capabilities);
      await adapter.invoke({
        prompt: 'Test',
        suggestMode: true,
        outputSchema: { type: 'object' },
      });

      const degradations = adapter.getDegradations();
      expect(degradations).toHaveLength(2);

      // Modifying returned array should not affect internal state
      degradations.pop();
      expect(adapter.getDegradations()).toHaveLength(2);
    });
  });
});

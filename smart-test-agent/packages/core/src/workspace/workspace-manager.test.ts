/**
 * Unit tests for Workspace Manager
 * @see Requirements 14.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createWorkspace,
  workspaceExists,
  getWorkspaceStructure,
  deleteWorkspace,
  listWorkspaces,
  calculateChecksum,
  calculateChecksums,
  WORKSPACE_SUBDIRS,
} from './workspace-manager';

describe('Workspace Manager', () => {
  let testBaseDir: string;

  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `workspace-test-${Date.now()}`);
    await fs.mkdir(testBaseDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  describe('createWorkspace', () => {
    it('should create workspace with all required directories', async () => {
      const runId = 'test-run-001';
      const workspace = await createWorkspace(testBaseDir, runId);

      expect(workspace.root).toBe(path.join(testBaseDir, runId));
      expect(workspace.sourceContext).toBe(path.join(testBaseDir, runId, 'source-context'));
      expect(workspace.evidence).toBe(path.join(testBaseDir, runId, 'evidence'));
      expect(workspace.screenshots).toBe(path.join(testBaseDir, runId, 'evidence/screenshots'));
      expect(workspace.traces).toBe(path.join(testBaseDir, runId, 'evidence/traces'));
      expect(workspace.manifest).toBe(path.join(testBaseDir, runId, 'manifest.json'));

      // Verify directories exist
      for (const subdir of WORKSPACE_SUBDIRS) {
        const stat = await fs.stat(path.join(workspace.root, subdir));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it('should throw error for empty runId', async () => {
      await expect(createWorkspace(testBaseDir, '')).rejects.toThrow('Invalid runId');
    });

    it('should throw error for runId with invalid characters', async () => {
      await expect(createWorkspace(testBaseDir, '../escape')).rejects.toThrow('Invalid runId');
      await expect(createWorkspace(testBaseDir, 'run/id')).rejects.toThrow('Invalid runId');
    });

    it('should accept valid runId formats', async () => {
      const validIds = ['run-001', 'test_run', 'RUN123', 'a-b_c-123'];

      for (const runId of validIds) {
        const workspace = await createWorkspace(testBaseDir, runId);
        expect(workspace.root).toContain(runId);
        await deleteWorkspace(testBaseDir, runId);
      }
    });

    it('should be idempotent - creating same workspace twice should succeed', async () => {
      const runId = 'idempotent-test';

      const workspace1 = await createWorkspace(testBaseDir, runId);
      const workspace2 = await createWorkspace(testBaseDir, runId);

      expect(workspace1.root).toBe(workspace2.root);
    });
  });

  describe('workspaceExists', () => {
    it('should return true for existing workspace', async () => {
      const runId = 'existing-workspace';
      await createWorkspace(testBaseDir, runId);

      const exists = await workspaceExists(testBaseDir, runId);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing workspace', async () => {
      const exists = await workspaceExists(testBaseDir, 'non-existing');
      expect(exists).toBe(false);
    });

    it('should return false if subdirectories are missing', async () => {
      const runId = 'incomplete-workspace';
      const rootPath = path.join(testBaseDir, runId);
      await fs.mkdir(rootPath, { recursive: true });
      // Only create root, not subdirectories

      const exists = await workspaceExists(testBaseDir, runId);
      expect(exists).toBe(false);
    });
  });

  describe('getWorkspaceStructure', () => {
    it('should return correct structure paths', () => {
      const runId = 'structure-test';
      const structure = getWorkspaceStructure(testBaseDir, runId);

      expect(structure.root).toBe(path.join(testBaseDir, runId));
      expect(structure.sourceContext).toBe(path.join(testBaseDir, runId, 'source-context'));
      expect(structure.evidence).toBe(path.join(testBaseDir, runId, 'evidence'));
      expect(structure.screenshots).toBe(path.join(testBaseDir, runId, 'evidence/screenshots'));
      expect(structure.traces).toBe(path.join(testBaseDir, runId, 'evidence/traces'));
      expect(structure.manifest).toBe(path.join(testBaseDir, runId, 'manifest.json'));
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete existing workspace', async () => {
      const runId = 'to-delete';
      await createWorkspace(testBaseDir, runId);

      await deleteWorkspace(testBaseDir, runId);

      const exists = await workspaceExists(testBaseDir, runId);
      expect(exists).toBe(false);
    });

    it('should not throw for non-existing workspace', async () => {
      await expect(deleteWorkspace(testBaseDir, 'non-existing')).resolves.not.toThrow();
    });
  });

  describe('listWorkspaces', () => {
    it('should list all workspaces', async () => {
      await createWorkspace(testBaseDir, 'workspace-1');
      await createWorkspace(testBaseDir, 'workspace-2');
      await createWorkspace(testBaseDir, 'workspace-3');

      const workspaces = await listWorkspaces(testBaseDir);

      expect(workspaces).toContain('workspace-1');
      expect(workspaces).toContain('workspace-2');
      expect(workspaces).toContain('workspace-3');
      expect(workspaces.length).toBe(3);
    });

    it('should return empty array for non-existing directory', async () => {
      const workspaces = await listWorkspaces('/non/existing/path');
      expect(workspaces).toEqual([]);
    });

    it('should return empty array for empty directory', async () => {
      const workspaces = await listWorkspaces(testBaseDir);
      expect(workspaces).toEqual([]);
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate SHA256 checksum', async () => {
      const testFile = path.join(testBaseDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!');

      const checksum = await calculateChecksum(testFile);

      // SHA256 of "Hello, World!" is known
      expect(checksum).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('should produce different checksums for different content', async () => {
      const file1 = path.join(testBaseDir, 'file1.txt');
      const file2 = path.join(testBaseDir, 'file2.txt');
      await fs.writeFile(file1, 'Content A');
      await fs.writeFile(file2, 'Content B');

      const checksum1 = await calculateChecksum(file1);
      const checksum2 = await calculateChecksum(file2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should throw for non-existing file', async () => {
      await expect(calculateChecksum('/non/existing/file')).rejects.toThrow();
    });
  });

  describe('calculateChecksums', () => {
    it('should calculate checksums for multiple files', async () => {
      const file1 = path.join(testBaseDir, 'file1.txt');
      const file2 = path.join(testBaseDir, 'file2.txt');
      await fs.writeFile(file1, 'Content 1');
      await fs.writeFile(file2, 'Content 2');

      const checksums = await calculateChecksums([file1, file2]);

      expect(checksums['file1.txt']).toBeDefined();
      expect(checksums['file2.txt']).toBeDefined();
      expect(checksums['file1.txt']).not.toBe(checksums['file2.txt']);
    });

    it('should skip non-existing files', async () => {
      const existingFile = path.join(testBaseDir, 'existing.txt');
      await fs.writeFile(existingFile, 'Content');

      const checksums = await calculateChecksums([
        existingFile,
        '/non/existing/file.txt',
      ]);

      expect(checksums['existing.txt']).toBeDefined();
      expect(checksums['file.txt']).toBeUndefined();
    });
  });
});

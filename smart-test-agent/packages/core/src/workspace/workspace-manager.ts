/**
 * Workspace Manager
 * Creates and manages test run workspace directories
 * @see Requirements 14.1
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Workspace directory structure
 */
export interface WorkspaceStructure {
  /** Root workspace path */
  root: string;
  /** Source context directory */
  sourceContext: string;
  /** Evidence directory */
  evidence: string;
  /** Screenshots directory */
  screenshots: string;
  /** Traces directory */
  traces: string;
  /** Manifest file path */
  manifest: string;
}

/**
 * Required subdirectories for a workspace
 */
export const WORKSPACE_SUBDIRS = [
  'source-context',
  'evidence',
  'evidence/screenshots',
  'evidence/traces',
] as const;

/**
 * Create workspace directory structure for a test run
 * @param baseDir Base directory for workspaces (e.g., '.ai-test-workspace')
 * @param runId Test run ID
 * @returns Workspace structure with all paths
 */
export async function createWorkspace(
  baseDir: string,
  runId: string
): Promise<WorkspaceStructure> {
  // Validate runId
  if (!runId || typeof runId !== 'string') {
    throw new Error('Invalid runId: must be a non-empty string');
  }

  // Sanitize runId to prevent path traversal
  const sanitizedRunId = runId.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (sanitizedRunId !== runId) {
    throw new Error('Invalid runId: contains invalid characters');
  }

  const rootPath = path.join(baseDir, runId);

  // Create root directory
  await fs.mkdir(rootPath, { recursive: true });

  // Create subdirectories
  for (const subdir of WORKSPACE_SUBDIRS) {
    await fs.mkdir(path.join(rootPath, subdir), { recursive: true });
  }

  return {
    root: rootPath,
    sourceContext: path.join(rootPath, 'source-context'),
    evidence: path.join(rootPath, 'evidence'),
    screenshots: path.join(rootPath, 'evidence/screenshots'),
    traces: path.join(rootPath, 'evidence/traces'),
    manifest: path.join(rootPath, 'manifest.json'),
  };
}

/**
 * Check if workspace exists and has required structure
 */
export async function workspaceExists(
  baseDir: string,
  runId: string
): Promise<boolean> {
  const rootPath = path.join(baseDir, runId);

  try {
    const stat = await fs.stat(rootPath);
    if (!stat.isDirectory()) {
      return false;
    }

    // Check all required subdirectories
    for (const subdir of WORKSPACE_SUBDIRS) {
      const subdirPath = path.join(rootPath, subdir);
      const subdirStat = await fs.stat(subdirPath);
      if (!subdirStat.isDirectory()) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get workspace structure for an existing workspace
 */
export function getWorkspaceStructure(
  baseDir: string,
  runId: string
): WorkspaceStructure {
  const rootPath = path.join(baseDir, runId);

  return {
    root: rootPath,
    sourceContext: path.join(rootPath, 'source-context'),
    evidence: path.join(rootPath, 'evidence'),
    screenshots: path.join(rootPath, 'evidence/screenshots'),
    traces: path.join(rootPath, 'evidence/traces'),
    manifest: path.join(rootPath, 'manifest.json'),
  };
}

/**
 * Delete workspace directory
 */
export async function deleteWorkspace(
  baseDir: string,
  runId: string
): Promise<void> {
  const rootPath = path.join(baseDir, runId);
  await fs.rm(rootPath, { recursive: true, force: true });
}

/**
 * List all workspaces in base directory
 */
export async function listWorkspaces(baseDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Calculate SHA256 checksum of a file
 */
export async function calculateChecksum(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate checksums for multiple files
 */
export async function calculateChecksums(
  filePaths: string[]
): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};

  for (const filePath of filePaths) {
    try {
      checksums[path.basename(filePath)] = await calculateChecksum(filePath);
    } catch {
      // Skip files that don't exist or can't be read
    }
  }

  return checksums;
}

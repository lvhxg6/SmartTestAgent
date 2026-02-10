/**
 * Property-Based Tests for Workspace Management
 * **Validates: Requirements 14.1, 14.2, 14.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createWorkspace,
  workspaceExists,
  WORKSPACE_SUBDIRS,
} from './workspace-manager';
import {
  createManifest,
  validateManifest,
  REQUIRED_MANIFEST_FIELDS,
} from './manifest-manager';

/**
 * **Property 30: Workspace Directory Structure**
 * 
 * *For any* test run, the workspace should be created with the required directory structure.
 * 
 * **Validates: Requirements 14.1**
 */
describe('Property 30: Workspace Directory Structure', () => {
  let testBaseDir: string;

  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `workspace-prop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testBaseDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  // Arbitrary for valid run IDs
  const validRunIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{2,30}$/);

  it('should create all required subdirectories for any valid runId', async () => {
    await fc.assert(
      fc.asyncProperty(validRunIdArb, async (runId) => {
        const workspace = await createWorkspace(testBaseDir, runId);

        // Property: root directory should exist
        const rootStat = await fs.stat(workspace.root);
        expect(rootStat.isDirectory()).toBe(true);

        // Property: all required subdirectories should exist
        for (const subdir of WORKSPACE_SUBDIRS) {
          const subdirPath = path.join(workspace.root, subdir);
          const subdirStat = await fs.stat(subdirPath);
          expect(subdirStat.isDirectory()).toBe(true);
        }

        // Cleanup for next iteration
        await fs.rm(workspace.root, { recursive: true, force: true });
      }),
      { numRuns: 20 }
    );
  });

  it('should pass workspaceExists check after creation', async () => {
    await fc.assert(
      fc.asyncProperty(validRunIdArb, async (runId) => {
        await createWorkspace(testBaseDir, runId);

        // Property: workspaceExists should return true after creation
        const exists = await workspaceExists(testBaseDir, runId);
        expect(exists).toBe(true);

        // Cleanup
        await fs.rm(path.join(testBaseDir, runId), { recursive: true, force: true });
      }),
      { numRuns: 20 }
    );
  });

  it('should create workspace idempotently', async () => {
    await fc.assert(
      fc.asyncProperty(validRunIdArb, async (runId) => {
        // Create twice
        const workspace1 = await createWorkspace(testBaseDir, runId);
        const workspace2 = await createWorkspace(testBaseDir, runId);

        // Property: both calls should return same structure
        expect(workspace1.root).toBe(workspace2.root);
        expect(workspace1.sourceContext).toBe(workspace2.sourceContext);
        expect(workspace1.screenshots).toBe(workspace2.screenshots);

        // Property: workspace should still be valid
        const exists = await workspaceExists(testBaseDir, runId);
        expect(exists).toBe(true);

        // Cleanup
        await fs.rm(workspace1.root, { recursive: true, force: true });
      }),
      { numRuns: 20 }
    );
  });

  it('should have correct path structure', async () => {
    await fc.assert(
      fc.asyncProperty(validRunIdArb, async (runId) => {
        const workspace = await createWorkspace(testBaseDir, runId);

        // Property: paths should follow expected structure
        expect(workspace.root).toBe(path.join(testBaseDir, runId));
        expect(workspace.sourceContext).toBe(path.join(testBaseDir, runId, 'source-context'));
        expect(workspace.evidence).toBe(path.join(testBaseDir, runId, 'evidence'));
        expect(workspace.screenshots).toBe(path.join(testBaseDir, runId, 'evidence/screenshots'));
        expect(workspace.traces).toBe(path.join(testBaseDir, runId, 'evidence/traces'));
        expect(workspace.manifest).toBe(path.join(testBaseDir, runId, 'manifest.json'));

        // Cleanup
        await fs.rm(workspace.root, { recursive: true, force: true });
      }),
      { numRuns: 20 }
    );
  });
});

/**
 * **Property 31: Manifest Completeness**
 * 
 * *For any* test run manifest.json, it should contain all required fields.
 * 
 * **Validates: Requirements 14.2, 14.3**
 */
describe('Property 31: Manifest Completeness', () => {
  // Arbitraries for manifest fields
  const runIdArb = fc.stringMatching(/^run-[a-zA-Z0-9]{3,10}$/);
  const projectIdArb = fc.stringMatching(/^project-[a-zA-Z0-9]{3,10}$/);
  const versionArb = fc.stringMatching(/^[0-9]+\.[0-9]+\.[0-9]+$/);

  const agentVersionsArb = fc.record({
    claudeCode: versionArb,
    codex: versionArb,
  });

  const promptVersionsArb = fc.record({
    prdParse: versionArb,
    uiTestExecute: versionArb,
    reviewResults: versionArb,
  });

  const envFingerprintArb = fc.record({
    serviceVersion: fc.option(versionArb, { nil: undefined }),
    gitCommit: fc.option(fc.hexaString({ minLength: 7, maxLength: 40 }), { nil: undefined }),
    configHash: fc.option(fc.hexaString({ minLength: 32, maxLength: 64 }), { nil: undefined }),
    browserVersion: fc.option(fc.string({ minLength: 5, maxLength: 30 }), { nil: undefined }),
  });

  it('should create valid manifest for any valid inputs', () => {
    fc.assert(
      fc.property(
        runIdArb,
        projectIdArb,
        agentVersionsArb,
        promptVersionsArb,
        envFingerprintArb,
        (runId, projectId, agentVersions, promptVersions, envFingerprint) => {
          const manifest = createManifest(
            runId,
            projectId,
            agentVersions,
            promptVersions,
            envFingerprint
          );

          // Property: manifest should be valid
          expect(validateManifest(manifest)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should contain all required top-level fields', () => {
    fc.assert(
      fc.property(
        runIdArb,
        projectIdArb,
        agentVersionsArb,
        promptVersionsArb,
        (runId, projectId, agentVersions, promptVersions) => {
          const manifest = createManifest(runId, projectId, agentVersions, promptVersions);

          // Property: all required fields should be present
          for (const field of REQUIRED_MANIFEST_FIELDS) {
            expect(field in manifest).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have correct initial status', () => {
    fc.assert(
      fc.property(
        runIdArb,
        projectIdArb,
        agentVersionsArb,
        promptVersionsArb,
        (runId, projectId, agentVersions, promptVersions) => {
          const manifest = createManifest(runId, projectId, agentVersions, promptVersions);

          // Property: initial status should be 'created'
          expect(manifest.status).toBe('created');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have empty arrays for logs and decisions initially', () => {
    fc.assert(
      fc.property(
        runIdArb,
        projectIdArb,
        agentVersionsArb,
        promptVersionsArb,
        (runId, projectId, agentVersions, promptVersions) => {
          const manifest = createManifest(runId, projectId, agentVersions, promptVersions);

          // Property: decision log should be empty initially
          expect(manifest.decisionLog).toEqual([]);

          // Property: degradation decisions should be empty initially
          expect(manifest.degradationDecisions).toEqual([]);

          // Property: artifact checksums should be empty initially
          expect(manifest.artifactChecksums).toEqual({});
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve input values', () => {
    fc.assert(
      fc.property(
        runIdArb,
        projectIdArb,
        agentVersionsArb,
        promptVersionsArb,
        (runId, projectId, agentVersions, promptVersions) => {
          const manifest = createManifest(runId, projectId, agentVersions, promptVersions);

          // Property: input values should be preserved
          expect(manifest.runId).toBe(runId);
          expect(manifest.projectId).toBe(projectId);
          expect(manifest.agentVersions).toEqual(agentVersions);
          expect(manifest.promptVersions).toEqual(promptVersions);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have valid timestamps', () => {
    fc.assert(
      fc.property(
        runIdArb,
        projectIdArb,
        agentVersionsArb,
        promptVersionsArb,
        (runId, projectId, agentVersions, promptVersions) => {
          const before = new Date().toISOString();
          const manifest = createManifest(runId, projectId, agentVersions, promptVersions);
          const after = new Date().toISOString();

          // Property: timestamps should be valid ISO strings
          expect(() => new Date(manifest.createdAt)).not.toThrow();
          expect(() => new Date(manifest.updatedAt)).not.toThrow();

          // Property: timestamps should be within expected range
          expect(manifest.createdAt >= before).toBe(true);
          expect(manifest.createdAt <= after).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

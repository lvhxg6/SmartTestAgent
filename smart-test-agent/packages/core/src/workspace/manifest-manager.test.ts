/**
 * Unit tests for Manifest Manager
 * @see Requirements 14.2, 14.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  createManifest,
  saveManifest,
  loadManifest,
  updateManifestStatus,
  addDecisionLogEntry,
  updateArtifactChecksums,
  addDegradationDecision,
  updateQualityMetrics,
  updateEnvFingerprint,
  validateManifest,
  getMissingFields,
  REQUIRED_MANIFEST_FIELDS,
  type Manifest,
} from './manifest-manager';

describe('Manifest Manager', () => {
  let testDir: string;
  let manifestPath: string;

  const defaultAgentVersions = { claudeCode: '1.0.0', codex: '2.0.0' };
  const defaultPromptVersions = {
    prdParse: '1.0',
    uiTestExecute: '1.0',
    reviewResults: '1.0',
  };

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `manifest-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    manifestPath = path.join(testDir, 'manifest.json');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('createManifest', () => {
    it('should create manifest with required fields', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      expect(manifest.runId).toBe('run-001');
      expect(manifest.projectId).toBe('project-001');
      expect(manifest.status).toBe('created');
      expect(manifest.agentVersions).toEqual(defaultAgentVersions);
      expect(manifest.promptVersions).toEqual(defaultPromptVersions);
      expect(manifest.artifactChecksums).toEqual({});
      expect(manifest.decisionLog).toEqual([]);
      expect(manifest.degradationDecisions).toEqual([]);
      expect(manifest.createdAt).toBeDefined();
      expect(manifest.updatedAt).toBeDefined();
    });

    it('should include environment fingerprint when provided', () => {
      const envFingerprint = {
        serviceVersion: '1.0.0',
        gitCommit: 'abc123',
      };

      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions,
        envFingerprint
      );

      expect(manifest.envFingerprint).toEqual(envFingerprint);
    });
  });

  describe('saveManifest and loadManifest', () => {
    it('should save and load manifest correctly', async () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      await saveManifest(manifestPath, manifest);
      const loaded = await loadManifest(manifestPath);

      expect(loaded.runId).toBe(manifest.runId);
      expect(loaded.projectId).toBe(manifest.projectId);
      expect(loaded.status).toBe(manifest.status);
    });

    it('should update updatedAt on save', async () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );
      const originalUpdatedAt = manifest.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await saveManifest(manifestPath, manifest);
      const loaded = await loadManifest(manifestPath);

      expect(loaded.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('updateManifestStatus', () => {
    it('should update status', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const updated = updateManifestStatus(manifest, 'executing');

      expect(updated.status).toBe('executing');
      expect(updated.reasonCode).toBeUndefined();
    });

    it('should update status with reason code', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const updated = updateManifestStatus(manifest, 'failed', 'playwright_error');

      expect(updated.status).toBe('failed');
      expect(updated.reasonCode).toBe('playwright_error');
    });
  });

  describe('addDecisionLogEntry', () => {
    it('should add decision log entry with timestamp', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const updated = addDecisionLogEntry(manifest, {
        fromState: 'created',
        toState: 'parsing',
        event: 'START_PARSING',
      });

      expect(updated.decisionLog.length).toBe(1);
      expect(updated.decisionLog[0].fromState).toBe('created');
      expect(updated.decisionLog[0].toState).toBe('parsing');
      expect(updated.decisionLog[0].event).toBe('START_PARSING');
      expect(updated.decisionLog[0].timestamp).toBeDefined();
    });

    it('should append to existing decision log', () => {
      let manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      manifest = addDecisionLogEntry(manifest, {
        fromState: 'created',
        toState: 'parsing',
        event: 'START_PARSING',
      });

      manifest = addDecisionLogEntry(manifest, {
        fromState: 'parsing',
        toState: 'generating',
        event: 'PARSING_COMPLETE',
      });

      expect(manifest.decisionLog.length).toBe(2);
    });
  });

  describe('updateArtifactChecksums', () => {
    it('should update artifact checksums', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const updated = updateArtifactChecksums(manifest, {
        requirements: 'abc123',
        testCases: 'def456',
      });

      expect(updated.artifactChecksums.requirements).toBe('abc123');
      expect(updated.artifactChecksums.testCases).toBe('def456');
    });

    it('should merge with existing checksums', () => {
      let manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      manifest = updateArtifactChecksums(manifest, { requirements: 'abc123' });
      manifest = updateArtifactChecksums(manifest, { testCases: 'def456' });

      expect(manifest.artifactChecksums.requirements).toBe('abc123');
      expect(manifest.artifactChecksums.testCases).toBe('def456');
    });
  });

  describe('addDegradationDecision', () => {
    it('should add degradation decision with timestamp', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const updated = addDegradationDecision(manifest, {
        feature: 'stream-json',
        originalMode: 'stream-json',
        fallbackMode: 'json',
        reason: 'Not supported by CLI version',
      });

      expect(updated.degradationDecisions.length).toBe(1);
      expect(updated.degradationDecisions[0].feature).toBe('stream-json');
      expect(updated.degradationDecisions[0].timestamp).toBeDefined();
    });
  });

  describe('updateQualityMetrics', () => {
    it('should update quality metrics', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const metrics = {
        rc: { name: 'RC' as const, value: 0.9, threshold: 0.85, passed: true },
        apr: { name: 'APR' as const, value: 0.98, threshold: 0.95, passed: true },
      };

      const updated = updateQualityMetrics(manifest, metrics);

      expect(updated.qualityMetrics).toEqual(metrics);
    });
  });

  describe('updateEnvFingerprint', () => {
    it('should update environment fingerprint', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const updated = updateEnvFingerprint(manifest, {
        serviceVersion: '2.0.0',
        browserVersion: 'Chrome 120',
      });

      expect(updated.envFingerprint.serviceVersion).toBe('2.0.0');
      expect(updated.envFingerprint.browserVersion).toBe('Chrome 120');
    });

    it('should merge with existing fingerprint', () => {
      let manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions,
        { gitCommit: 'abc123' }
      );

      manifest = updateEnvFingerprint(manifest, { serviceVersion: '2.0.0' });

      expect(manifest.envFingerprint.gitCommit).toBe('abc123');
      expect(manifest.envFingerprint.serviceVersion).toBe('2.0.0');
    });
  });

  describe('validateManifest', () => {
    it('should return true for valid manifest', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      expect(validateManifest(manifest)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateManifest(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateManifest('string')).toBe(false);
      expect(validateManifest(123)).toBe(false);
    });

    it('should return false for missing required fields', () => {
      const incomplete = {
        runId: 'run-001',
        projectId: 'project-001',
        // Missing other fields
      };

      expect(validateManifest(incomplete)).toBe(false);
    });

    it('should return false for missing nested agent version fields', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const invalid = {
        ...manifest,
        agentVersions: { claudeCode: '1.0' }, // Missing codex
      };

      expect(validateManifest(invalid)).toBe(false);
    });

    it('should return false for missing nested prompt version fields', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const invalid = {
        ...manifest,
        promptVersions: { prdParse: '1.0' }, // Missing others
      };

      expect(validateManifest(invalid)).toBe(false);
    });
  });

  describe('getMissingFields', () => {
    it('should return empty array for valid manifest', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      expect(getMissingFields(manifest)).toEqual([]);
    });

    it('should return all fields for null', () => {
      const missing = getMissingFields(null);
      expect(missing.length).toBe(REQUIRED_MANIFEST_FIELDS.length);
    });

    it('should return missing top-level fields', () => {
      const incomplete = {
        runId: 'run-001',
        projectId: 'project-001',
      };

      const missing = getMissingFields(incomplete);
      expect(missing).toContain('status');
      expect(missing).toContain('agentVersions');
    });

    it('should return missing nested fields', () => {
      const manifest = createManifest(
        'run-001',
        'project-001',
        defaultAgentVersions,
        defaultPromptVersions
      );

      const invalid = {
        ...manifest,
        agentVersions: { claudeCode: '1.0' },
        promptVersions: { prdParse: '1.0' },
      };

      const missing = getMissingFields(invalid);
      expect(missing).toContain('agentVersions.codex');
      expect(missing).toContain('promptVersions.uiTestExecute');
      expect(missing).toContain('promptVersions.reviewResults');
    });
  });
});

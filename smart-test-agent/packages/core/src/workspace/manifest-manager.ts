/**
 * Manifest Manager
 * Manages manifest.json for test runs
 * @see Requirements 14.2, 14.3
 */

import * as fs from 'fs/promises';
import type {
  TestRunState,
  ReasonCode,
  AgentVersions,
  PromptVersions,
  EnvFingerprint,
  DecisionLogEntry,
  ArtifactChecksums,
  QualityMetrics,
  DegradationDecision,
} from '@smart-test-agent/shared';

/**
 * Manifest structure
 * @see Requirements 14.2
 */
export interface Manifest {
  /** Test run ID */
  runId: string;
  /** Project ID */
  projectId: string;
  /** Current status */
  status: TestRunState;
  /** Reason code if failed */
  reasonCode?: ReasonCode;
  /** Agent versions */
  agentVersions: AgentVersions;
  /** Prompt versions */
  promptVersions: PromptVersions;
  /** Artifact checksums */
  artifactChecksums: ArtifactChecksums;
  /** Decision log */
  decisionLog: DecisionLogEntry[];
  /** Environment fingerprint */
  envFingerprint: EnvFingerprint;
  /** Quality metrics (if available) */
  qualityMetrics?: QualityMetrics;
  /** Degradation decisions */
  degradationDecisions: DegradationDecision[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Required fields for manifest validation
 */
export const REQUIRED_MANIFEST_FIELDS = [
  'runId',
  'projectId',
  'status',
  'agentVersions',
  'promptVersions',
  'artifactChecksums',
  'decisionLog',
  'envFingerprint',
  'degradationDecisions',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Create initial manifest
 */
export function createManifest(
  runId: string,
  projectId: string,
  agentVersions: AgentVersions,
  promptVersions: PromptVersions,
  envFingerprint: EnvFingerprint = {}
): Manifest {
  const now = new Date().toISOString();

  return {
    runId,
    projectId,
    status: 'created',
    agentVersions,
    promptVersions,
    artifactChecksums: {},
    decisionLog: [],
    envFingerprint,
    degradationDecisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Save manifest to file
 */
export async function saveManifest(
  manifestPath: string,
  manifest: Manifest
): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Load manifest from file
 */
export async function loadManifest(manifestPath: string): Promise<Manifest> {
  const content = await fs.readFile(manifestPath, 'utf-8');
  return JSON.parse(content) as Manifest;
}

/**
 * Update manifest status
 */
export function updateManifestStatus(
  manifest: Manifest,
  status: TestRunState,
  reasonCode?: ReasonCode
): Manifest {
  return {
    ...manifest,
    status,
    reasonCode,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add decision log entry
 * @see Requirements 14.3
 */
export function addDecisionLogEntry(
  manifest: Manifest,
  entry: Omit<DecisionLogEntry, 'timestamp'>
): Manifest {
  const newEntry: DecisionLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  return {
    ...manifest,
    decisionLog: [...manifest.decisionLog, newEntry],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update artifact checksums
 */
export function updateArtifactChecksums(
  manifest: Manifest,
  checksums: Partial<ArtifactChecksums>
): Manifest {
  return {
    ...manifest,
    artifactChecksums: {
      ...manifest.artifactChecksums,
      ...checksums,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add degradation decision
 * @see Requirements 15.5
 */
export function addDegradationDecision(
  manifest: Manifest,
  decision: Omit<DegradationDecision, 'timestamp'>
): Manifest {
  const newDecision: DegradationDecision = {
    ...decision,
    timestamp: new Date().toISOString(),
  };

  return {
    ...manifest,
    degradationDecisions: [...manifest.degradationDecisions, newDecision],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update quality metrics
 */
export function updateQualityMetrics(
  manifest: Manifest,
  metrics: QualityMetrics
): Manifest {
  return {
    ...manifest,
    qualityMetrics: metrics,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update environment fingerprint
 */
export function updateEnvFingerprint(
  manifest: Manifest,
  fingerprint: Partial<EnvFingerprint>
): Manifest {
  return {
    ...manifest,
    envFingerprint: {
      ...manifest.envFingerprint,
      ...fingerprint,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validate manifest has all required fields
 */
export function validateManifest(manifest: unknown): manifest is Manifest {
  if (!manifest || typeof manifest !== 'object') {
    return false;
  }

  const obj = manifest as Record<string, unknown>;

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in obj)) {
      return false;
    }
  }

  // Validate nested required fields
  if (!obj.agentVersions || typeof obj.agentVersions !== 'object') {
    return false;
  }
  const agentVersions = obj.agentVersions as Record<string, unknown>;
  if (!('claudeCode' in agentVersions) || !('codex' in agentVersions)) {
    return false;
  }

  if (!obj.promptVersions || typeof obj.promptVersions !== 'object') {
    return false;
  }
  const promptVersions = obj.promptVersions as Record<string, unknown>;
  if (
    !('prdParse' in promptVersions) ||
    !('uiTestExecute' in promptVersions) ||
    !('reviewResults' in promptVersions)
  ) {
    return false;
  }

  return true;
}

/**
 * Get missing required fields
 */
export function getMissingFields(manifest: unknown): string[] {
  const missing: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return [...REQUIRED_MANIFEST_FIELDS];
  }

  const obj = manifest as Record<string, unknown>;

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  // Check nested fields
  if (obj.agentVersions && typeof obj.agentVersions === 'object') {
    const agentVersions = obj.agentVersions as Record<string, unknown>;
    if (!('claudeCode' in agentVersions)) {
      missing.push('agentVersions.claudeCode');
    }
    if (!('codex' in agentVersions)) {
      missing.push('agentVersions.codex');
    }
  }

  if (obj.promptVersions && typeof obj.promptVersions === 'object') {
    const promptVersions = obj.promptVersions as Record<string, unknown>;
    if (!('prdParse' in promptVersions)) {
      missing.push('promptVersions.prdParse');
    }
    if (!('uiTestExecute' in promptVersions)) {
      missing.push('promptVersions.uiTestExecute');
    }
    if (!('reviewResults' in promptVersions)) {
      missing.push('promptVersions.reviewResults');
    }
  }

  return missing;
}

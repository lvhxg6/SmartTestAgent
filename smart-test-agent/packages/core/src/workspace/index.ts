/**
 * Workspace Management Module
 * @see Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */

export {
  createWorkspace,
  workspaceExists,
  getWorkspaceStructure,
  deleteWorkspace,
  listWorkspaces,
  calculateChecksum,
  calculateChecksums,
  WORKSPACE_SUBDIRS,
  type WorkspaceStructure,
} from './workspace-manager.js';

export {
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
} from './manifest-manager.js';

export {
  buildTraceabilityChains,
  checkTraceability,
  getExcludedAssertions,
  filterTraceable,
  getTraceabilitySummary,
  type TraceabilityLink,
  type TraceabilityResult,
  type TraceabilitySummary,
} from './traceability-checker.js';

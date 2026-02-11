// Types module entry point
// Core types for PRD-Based UI Testing Agent System

// ============================================================================
// Target Profile Types (Requirements 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9)
// ============================================================================

/**
 * Browser configuration for Playwright
 * @see Requirements 1.4, 1.5
 */
export interface BrowserConfig {
  /** Whether to ignore HTTPS errors (for self-signed certificates) */
  ignoreHTTPSErrors: boolean;
  /** Browser viewport dimensions */
  viewport: { width: number; height: number };
  /** Browser locale setting */
  locale: string;
  /** Default timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Login configuration for target application
 * @see Requirements 1.1, 1.3
 */
export interface LoginConfig {
  /** URL of the login page */
  loginUrl: string;
  /** CSS selector for username input */
  usernameSelector: string;
  /** CSS selector for password input */
  passwordSelector: string;
  /** CSS selector for submit button */
  submitSelector: string;
  /** Credentials (supports environment variable references like $TEST_USERNAME) */
  credentials: {
    username: string;
    password: string;
  };
  /** Selector or text to verify successful login */
  successIndicator: string;
  /** Optional tenant value for multi-tenant applications */
  tenantValue?: string;
  /** Whether tenant is already selected */
  tenantAlreadySelected?: boolean;
}

/**
 * Source code configuration for context extraction
 * @see Requirements 2.1, 2.2, 2.3
 */
export interface SourceCodeConfig {
  /** Root directory of frontend source code */
  frontendRoot: string;
  /** Path to router configuration file */
  routerFile: string;
  /** Directory containing page components */
  pageDir: string;
  /** Directory containing API definitions */
  apiDir: string;
}

/**
 * Ant Design specific quirks configuration
 * @see Requirements 1.6, 1.7
 */
export interface AntdQuirksConfig {
  /** Whether two-character Chinese buttons have auto-inserted spaces */
  buttonTextSpace: boolean;
  /** Type of select component implementation */
  selectType: 'custom' | 'native';
  /** CSS selector for modal close button */
  modalCloseSelector: string;
}

/**
 * Operation types supported by the testing system
 * @see Requirements 1.9
 */
export type OperationType =
  | 'query'
  | 'view_detail'
  | 'search'
  | 'filter'
  | 'paginate'
  | 'create'
  | 'edit'
  | 'delete';

/**
 * UI Framework types supported by the system
 * @see Requirements 1.8
 */
export type UIFramework = 'antd' | 'element-ui' | 'custom';

/**
 * Target Profile - Configuration for test target project
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */
export interface TargetProfile {
  /** Unique identifier */
  id: string;
  /** Associated project ID */
  projectId: string;
  /** Base URL of the target application */
  baseUrl: string;
  /** Browser configuration */
  browser: BrowserConfig;
  /** Login configuration */
  login: LoginConfig;
  /** List of allowed routes for testing */
  allowedRoutes: string[];
  /** List of denied routes (optional) */
  deniedRoutes?: string[];
  /** List of allowed operation types */
  allowedOperations: OperationType[];
  /** List of denied operation types (optional) */
  deniedOperations?: OperationType[];
  /** Source code configuration */
  sourceCode: SourceCodeConfig;
  /** UI framework type */
  uiFramework: UIFramework;
  /** Ant Design specific quirks (optional) */
  antdQuirks?: AntdQuirksConfig;
}

// ============================================================================
// Test Run State Types (Requirements 13.1, 13.2, 14.1, 14.2)
// ============================================================================

/**
 * Test run state machine states
 * @see Requirements 13.1, 14.1
 */
export type TestRunState =
  | 'created'
  | 'parsing'
  | 'generating'
  | 'awaiting_approval'
  | 'executing'
  | 'codex_reviewing'
  | 'report_ready'
  | 'completed'
  | 'failed';

/**
 * Reason codes for failed state
 * @see Requirements 13.2, 14.2
 */
export type ReasonCode =
  | 'retry_exhausted'
  | 'agent_timeout'
  | 'approval_timeout'
  | 'confirm_timeout'
  | 'verdict_conflict'
  | 'playwright_error'
  | 'internal_error';

/**
 * State transition event types
 * @see Requirements 13.3
 */
export type StateEvent =
  | 'START_PARSING'
  | 'PARSING_COMPLETE'
  | 'GENERATION_COMPLETE'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTION_COMPLETE'
  | 'REVIEW_COMPLETE'
  | 'CONFIRMED'
  | 'RETEST'
  | 'ERROR'
  | 'TIMEOUT';

/**
 * Decision log entry for state transitions
 * @see Requirements 14.3
 */
export interface DecisionLogEntry {
  /** Timestamp of the decision */
  timestamp: string;
  /** Previous state */
  fromState: TestRunState;
  /** New state */
  toState: TestRunState;
  /** Event that triggered the transition */
  event: StateEvent;
  /** Optional reason for the transition */
  reason?: string;
  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Environment fingerprint for traceability
 * @see Requirements 14.3, 15.3
 */
export interface EnvFingerprint {
  /** Version of the target service */
  serviceVersion?: string;
  /** Git commit hash */
  gitCommit?: string;
  /** Configuration hash */
  configHash?: string;
  /** Browser version used */
  browserVersion?: string;
}

/**
 * Agent versions for manifest
 * @see Requirements 15.2
 */
export interface AgentVersions {
  /** Claude Code CLI version */
  claudeCode: string;
  /** Codex CLI version */
  codex: string;
}

/**
 * Prompt versions for manifest
 * @see Requirements 15.2
 */
export interface PromptVersions {
  /** PRD parse prompt version */
  prdParse: string;
  /** UI test execute prompt version */
  uiTestExecute: string;
  /** Review results prompt version */
  reviewResults: string;
}

/**
 * Artifact checksums for manifest
 * @see Requirements 15.2
 */
export interface ArtifactChecksums {
  /** Checksum of requirements.json */
  requirements?: string;
  /** Checksum of test-cases.json */
  testCases?: string;
  /** Checksum of execution-results.json */
  executionResults?: string;
  /** Checksum of codex-review-results.json */
  codexReviewResults?: string;
  /** Checksum of final report */
  report?: string;
}

// ============================================================================
// Requirement Types (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)
// ============================================================================

/**
 * Priority levels for requirements
 * @see Requirements 3.3
 */
export type RequirementPriority = 'P0' | 'P1' | 'P2';

/**
 * Requirement extracted from PRD
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
export interface Requirement {
  /** Unique identifier */
  id: string;
  /** Requirement ID from PRD */
  requirementId: string;
  /** Test run ID */
  runId: string;
  /** Requirement title */
  title: string;
  /** Detailed description */
  description: string;
  /** Priority level */
  priority: RequirementPriority;
  /** Whether this requirement can be UI automated */
  testable: boolean;
  /** Associated route path */
  route: string;
  /** List of acceptance criteria */
  acceptanceCriteria: string[];
  /** Source section in PRD */
  sourceSection?: string;
  /** Tags for categorization */
  tags: string[];
}

// ============================================================================
// Test Case Types (Requirements 4.1, 4.7, 4.8, 4.9, 4.11)
// ============================================================================

/**
 * Test step in a test case
 * @see Requirements 4.1
 */
export interface TestStep {
  /** Step number */
  stepNumber: number;
  /** Action description */
  action: string;
  /** Playwright selector */
  selector?: string;
  /** Input value (if applicable) */
  inputValue?: string;
  /** Expected result */
  expectedResult?: string;
  /** Whether to take screenshot after this step */
  screenshot?: boolean;
}

/**
 * Data preparation/cleanup step
 * @see Requirements 4.11, 18.1, 18.2, 18.3
 */
export interface DataStep {
  /** Action type */
  action: 'create' | 'update' | 'delete' | 'api_call';
  /** Target entity or endpoint */
  target: string;
  /** Data payload */
  data?: Record<string, unknown>;
  /** Whether this is a cleanup step */
  cleanup?: boolean;
}

/**
 * Assertion types
 * @see Requirements 4.8
 */
export type AssertionType =
  | 'element_visible'
  | 'text_content'
  | 'element_count'
  | 'navigation'
  | 'soft';

/**
 * Verdict types for assertions
 * @see Requirements 7.5, 7.6
 */
export type Verdict = 'pass' | 'fail' | 'error';

/**
 * Review verdict from Codex
 * @see Requirements 8.2, 8.3
 */
export type ReviewVerdict = 'agree' | 'disagree' | 'uncertain';

/**
 * Conflict types for disagreements
 * @see Requirements 8.4
 */
export type ConflictType = 'fact_conflict' | 'evidence_missing' | 'threshold_conflict';

/**
 * Assertion definition in test case
 * @see Requirements 4.7, 4.8
 */
export interface Assertion {
  /** Unique identifier */
  id: string;
  /** Assertion ID within test case */
  assertionId: string;
  /** Test run ID */
  runId: string;
  /** Test case ID */
  caseId: string;
  /** Assertion type */
  type: AssertionType;
  /** Human-readable description */
  description: string;
  /** Expected value or condition */
  expected: string;
  /** Actual value (after execution) */
  actual?: string;
  /** Machine verdict (deterministic assertions) */
  machineVerdict?: Verdict;
  /** Agent verdict (soft assertions) */
  agentVerdict?: Verdict;
  /** Agent reasoning for soft assertions */
  agentReasoning?: string;
  /** Codex review verdict */
  reviewVerdict?: ReviewVerdict;
  /** Conflict type if disagreement */
  conflictType?: ConflictType;
  /** Final verdict after arbitration */
  finalVerdict?: Verdict;
  /** Path to evidence (screenshot, etc.) */
  evidencePath?: string;
}

/**
 * Test case status
 * @see Requirements 7.5
 */
export type TestCaseStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';

/**
 * Test case definition
 * @see Requirements 4.1, 4.7, 4.8, 4.9, 4.11
 */
export interface TestCase {
  /** Unique identifier */
  id: string;
  /** Test case ID */
  caseId: string;
  /** Test run ID */
  runId: string;
  /** Associated requirement ID */
  requirementId: string;
  /** Route being tested */
  route: string;
  /** Test case title */
  title: string;
  /** Preconditions for the test */
  precondition: string;
  /** Test steps */
  steps: TestStep[];
  /** Assertions to verify */
  assertions: Assertion[];
  /** Data preparation steps */
  dataPreparation?: DataStep[];
  /** Data cleanup steps */
  dataCleanup?: DataStep[];
  /** Test case status */
  status?: TestCaseStatus;
}

// ============================================================================
// Test Run Types (Requirements 14.1, 14.2, 14.3, 14.4, 15.2)
// ============================================================================

/**
 * Test run - A complete test execution flow
 * @see Requirements 14.1, 14.2, 14.3, 14.4, 15.2
 */
export interface TestRun {
  /** Unique identifier */
  id: string;
  /** Associated project ID */
  projectId: string;
  /** Current state */
  state: TestRunState;
  /** Reason code if failed */
  reasonCode?: ReasonCode;
  /** Path to PRD document */
  prdPath: string;
  /** Routes being tested */
  testedRoutes: string[];
  /** Workspace directory path */
  workspacePath: string;
  /** Environment fingerprint */
  envFingerprint: EnvFingerprint;
  /** Agent versions */
  agentVersions: AgentVersions;
  /** Prompt versions */
  promptVersions: PromptVersions;
  /** Artifact checksums */
  artifactChecksums?: ArtifactChecksums;
  /** Decision log */
  decisionLog: DecisionLogEntry[];
  /** Quality metrics */
  qualityMetrics?: QualityMetrics;
  /** Path to Markdown report */
  reportPath?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Completion timestamp */
  completedAt?: Date;
  /** Associated requirements */
  requirements?: Requirement[];
  /** Associated test cases */
  testCases?: TestCase[];
}

// ============================================================================
// Execution Result Types (Requirements 7.3, 7.4, 7.5, 7.6, 7.7)
// ============================================================================

/**
 * Screenshot information
 * @see Requirements 7.4
 */
export interface Screenshot {
  /** Screenshot ID */
  id: string;
  /** Test case ID */
  caseId: string;
  /** Step number */
  stepNumber: number;
  /** File path */
  path: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Step execution result
 * @see Requirements 7.5
 */
export interface StepResult {
  /** Step number */
  stepNumber: number;
  /** Whether step succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Screenshot path */
  screenshotPath?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Test case execution result
 * @see Requirements 7.5
 */
export interface TestCaseResult {
  /** Test case ID */
  caseId: string;
  /** Overall status */
  status: TestCaseStatus;
  /** Step results */
  steps: StepResult[];
  /** Assertion results */
  assertions: Assertion[];
  /** Total duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Execution result for entire test run
 * @see Requirements 7.3, 7.4, 7.5, 7.6, 7.7
 */
export interface ExecutionResult {
  /** Test run ID */
  runId: string;
  /** Execution start time */
  startTime: string;
  /** Execution end time */
  endTime: string;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Test case results */
  testCases: TestCaseResult[];
  /** All screenshots */
  screenshots: Screenshot[];
  /** Overall success */
  success: boolean;
  /** Error if execution failed */
  error?: string;
  /** Reason code if failed */
  reasonCode?: ReasonCode;
}

// ============================================================================
// Quality Gate Types (Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6)
// ============================================================================

/**
 * Quality metric names
 * @see Requirements 11.1, 11.2, 11.5
 */
export type QualityMetricName = 'RC' | 'APR' | 'FR';

/**
 * Quality metric
 * @see Requirements 11.1, 11.2, 11.5
 */
export interface QualityMetric {
  /** Metric name */
  name: QualityMetricName;
  /** Calculated value */
  value: number;
  /** Threshold for passing */
  threshold: number;
  /** Whether metric passed threshold */
  passed: boolean;
}

/**
 * Quality metrics collection
 * @see Requirements 11.1, 11.2, 11.5
 */
export interface QualityMetrics {
  /** Requirements Coverage */
  rc: QualityMetric;
  /** Assertion Pass Rate */
  apr: QualityMetric;
  /** Flaky Rate (optional, requires 3+ runs) */
  fr?: QualityMetric;
}

/**
 * Quality gate evaluation result
 * @see Requirements 11.3, 11.4, 11.6
 */
export interface GateResult {
  /** Whether all gates passed */
  passed: boolean;
  /** Whether report generation is blocked */
  blocked: boolean;
  /** Warning messages */
  warnings: string[];
  /** All metrics */
  metrics: QualityMetric[];
}

// ============================================================================
// Defect Report Types (Requirements 10.1, 10.2, 10.3, 10.4, 10.5)
// ============================================================================

/**
 * Defect severity levels
 * @see Requirements 10.3
 */
export type DefectSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

/**
 * Defect report entry
 * @see Requirements 10.1, 10.2, 10.3
 */
export interface DefectReport {
  /** Defect ID */
  id: string;
  /** Severity level */
  severity: DefectSeverity;
  /** Defect title */
  title: string;
  /** Detailed description */
  description: string;
  /** Associated screenshots */
  screenshots: string[];
  /** Operation steps to reproduce */
  operationSteps: string[];
  /** Associated assertion ID */
  assertionId: string;
  /** Associated test case ID */
  caseId: string;
  /** Associated requirement ID */
  requirementId: string;
  /** Route where defect was found */
  route: string;
}

/**
 * Test case summary for report
 * @see Requirements 10.5
 */
export interface TestCaseSummary {
  /** Test case ID */
  caseId: string;
  /** Test case title */
  title: string;
  /** Status */
  status: TestCaseStatus;
  /** Number of assertions */
  assertionCount: number;
  /** Number of passed assertions */
  passedCount: number;
  /** Number of failed assertions */
  failedCount: number;
}

/**
 * Report summary
 * @see Requirements 10.5
 */
export interface ReportSummary {
  /** Total number of defects */
  totalDefects: number;
  /** Defects by severity */
  severityDistribution: Record<DefectSeverity, number>;
  /** Affected routes */
  affectedRoutes: string[];
  /** Quality metrics */
  qualityMetrics: QualityMetric[];
}

/**
 * Complete report data
 * @see Requirements 10.4, 10.5
 */
export interface ReportData {
  /** Test run ID */
  runId: string;
  /** Report summary */
  summary: ReportSummary;
  /** All defects */
  defects: DefectReport[];
  /** Test case summaries */
  testCases: TestCaseSummary[];
  /** Generation timestamp */
  generatedAt: string;
}

// ============================================================================
// Source Indexer Types (Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9)
// ============================================================================

/**
 * Frontend framework types
 * @see Requirements 2.9
 */
export type FrameworkType = 'vue' | 'react';

/**
 * Route mapping from router file
 * @see Requirements 2.1
 */
export interface RouteMapping {
  /** Route path */
  path: string;
  /** Component file path */
  componentPath: string;
  /** Menu key (optional) */
  menuKey?: string;
  /** Child routes */
  children?: RouteMapping[];
}

/**
 * Extracted component information
 * @see Requirements 2.2, 2.4, 2.5, 2.6, 2.7, 2.8
 */
export interface ExtractedComponent {
  /** File path */
  filePath: string;
  /** Framework type */
  framework: FrameworkType;
  /** Template content (Vue) */
  template?: string;
  /** Script exports (Vue) */
  scriptExports?: string;
  /** JSX content (React) */
  jsxContent?: string;
  /** Hooks content (React) */
  hooksContent?: string;
  /** API imports */
  apiImports: string[];
  /** Whether content was truncated */
  truncated: boolean;
}

/**
 * Extracted API definition
 * @see Requirements 2.2
 */
export interface ExtractedApi {
  /** File path */
  filePath: string;
  /** API endpoints */
  endpoints: ApiEndpoint[];
}

/**
 * API endpoint definition
 */
export interface ApiEndpoint {
  /** Endpoint name */
  name: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** URL path */
  path: string;
  /** Request parameters */
  params?: Record<string, string>;
}

/**
 * Source context for test generation
 * @see Requirements 2.3
 */
export interface SourceContext {
  /** Route being tested */
  route: string;
  /** Extracted component */
  component: ExtractedComponent;
  /** Extracted APIs */
  apis: ExtractedApi[];
  /** Framework type */
  framework: FrameworkType;
  /** Raw route file contents (for uploaded files) */
  rawRouteFiles?: string[];
  /** Raw page file contents (for uploaded files) */
  rawPageFiles?: string[];
}

// ============================================================================
// CLI Adapter Types (Requirements 15.1, 15.2, 15.3, 15.4, 15.5)
// ============================================================================

/**
 * Claude Code CLI capabilities
 * @see Requirements 15.1, 15.2
 */
export interface ClaudeCodeCapabilities {
  /** Whether stream-json output is supported */
  supportsStreamJson: boolean;
  /** Whether allowed-tools parameter is supported */
  supportsAllowedTools: boolean;
  /** CLI version */
  version: string;
}

/**
 * Codex CLI capabilities
 * @see Requirements 15.1, 15.2
 */
export interface CodexCapabilities {
  /** Whether suggest-mode is supported */
  supportsSuggestMode: boolean;
  /** Whether output-schema is supported */
  supportsOutputSchema: boolean;
  /** CLI version */
  version: string;
}

/**
 * Combined CLI capabilities
 * @see Requirements 15.1, 15.2
 */
export interface CliCapabilities {
  /** Claude Code capabilities */
  claudeCode: ClaudeCodeCapabilities;
  /** Codex capabilities */
  codex: CodexCapabilities;
}

/**
 * Degradation decision record
 * @see Requirements 15.5
 */
export interface DegradationDecision {
  /** Feature that was degraded */
  feature: string;
  /** Original mode */
  originalMode: string;
  /** Fallback mode */
  fallbackMode: string;
  /** Reason for degradation */
  reason: string;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// WebSocket Event Types (Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7)
// ============================================================================

/**
 * Completed step information
 * @see Requirements 16.4
 */
export interface CompletedStep {
  /** Step number */
  stepNumber: number;
  /** Step description */
  description: string;
  /** Completion timestamp */
  timestamp: string;
  /** Screenshot path (if available) */
  screenshotPath?: string;
}

/**
 * Remaining step information
 * @see Requirements 16.5
 */
export interface RemainingStep {
  /** Step number */
  stepNumber: number;
  /** Step description */
  description: string;
}

/**
 * Screenshot preview information
 * @see Requirements 16.6
 */
export interface ScreenshotInfo {
  /** Step number */
  stepNumber: number;
  /** Screenshot path */
  path: string;
  /** Thumbnail path (optional) */
  thumbnailPath?: string;
}

/**
 * WebSocket state change event payload
 * @see Requirements 16.2, 16.3, 16.4, 16.5, 16.6, 16.7
 */
export interface StateChangeEvent {
  /** Test run ID */
  runId: string;
  /** Current state */
  currentState: TestRunState;
  /** Completed steps */
  completedSteps: CompletedStep[];
  /** Remaining steps */
  remainingSteps: RemainingStep[];
  /** Latest screenshot preview */
  stepScreenshotPreview?: ScreenshotInfo;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Codex Review Types (Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6)
// ============================================================================

/**
 * P0 coverage check result
 * @see Requirements 5.4, 5.5
 */
export interface P0CoverageCheck {
  /** Whether all P0 requirements are covered */
  status: 'pass' | 'fail';
  /** List of missing P0 requirement IDs */
  missingP0Ids: string[];
}

/**
 * Test case review result from Codex
 * @see Requirements 5.1, 5.2, 5.3
 */
export interface TestCaseReview {
  /** Subject (test case) ID */
  subjectId: string;
  /** Review verdict */
  reviewVerdict: ReviewVerdict;
  /** Reasoning for the verdict */
  reasoning: string;
  /** Suggestions for improvement */
  suggestions?: string[];
}

/**
 * Codex review results for test cases
 * @see Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */
export interface CodexTestCaseReviewResults {
  /** Individual test case reviews */
  reviews: TestCaseReview[];
  /** P0 coverage check */
  p0CoverageCheck: P0CoverageCheck;
}

/**
 * Assertion review result from Codex
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export interface AssertionReview {
  /** Assertion ID */
  assertionId: string;
  /** Test case ID */
  caseId: string;
  /** Review verdict */
  reviewVerdict: ReviewVerdict;
  /** Reasoning for the verdict */
  reasoning: string;
  /** Conflict type if disagreement */
  conflictType?: ConflictType;
}

/**
 * Codex review results for execution
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export interface CodexExecutionReviewResults {
  /** Individual assertion reviews */
  reviews: AssertionReview[];
  /** False positives detected */
  falsePositives: string[];
  /** False negatives detected */
  falseNegatives: string[];
}

// ============================================================================
// Approval/Confirmation Types (Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 12.1, 12.2, 12.3, 12.4)
// ============================================================================

/**
 * Approval decision for test plan
 * @see Requirements 6.3, 6.4
 */
export interface ApprovalDecision {
  /** Whether approved */
  approved: boolean;
  /** Reviewer comments */
  comments?: string;
  /** Reviewer ID */
  reviewerId: string;
  /** Decision timestamp */
  timestamp: string;
}

/**
 * Confirmation decision for report
 * @see Requirements 12.3, 12.4
 */
export interface ConfirmationDecision {
  /** Whether confirmed */
  confirmed: boolean;
  /** Whether to retest */
  retest: boolean;
  /** Reviewer comments */
  comments?: string;
  /** Reviewer ID */
  reviewerId: string;
  /** Decision timestamp */
  timestamp: string;
}

// ============================================================================
// Project Types
// ============================================================================

/**
 * Project definition
 */
export interface Project {
  /** Unique identifier */
  id: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Associated target profile */
  targetProfile?: TargetProfile;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Orchestrator Module
 * State machine orchestration engine for test run management
 * 
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { prisma, toJsonString, fromJsonString } from '@smart-test-agent/db';
import type {
  TestRun,
  TestRunState,
  StateEvent,
  ReasonCode,
  DecisionLogEntry,
  EnvFingerprint,
  AgentVersions,
  PromptVersions,
  ApprovalDecision,
  ConfirmationDecision,
} from '@smart-test-agent/shared';
import {
  StateMachine,
  isTerminalState,
  isValidTransition,
  getTargetState,
  getValidEventsForState,
  getTimeoutReasonCode,
  getErrorReasonCode,
  type TransitionResult,
} from './state-machine.js';

// Re-export state machine utilities
export {
  StateMachine,
  isTerminalState,
  isValidTransition,
  getTargetState,
  getValidEventsForState,
  getTimeoutReasonCode,
  getErrorReasonCode,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
  type StateTransition,
  type TransitionResult,
  type IdempotencyKey,
} from './state-machine.js';

/**
 * Input for creating a new test run
 */
export interface CreateTestRunInput {
  projectId: string;
  prdPath: string;
  routes: string[];
  envFingerprint?: EnvFingerprint;
  agentVersions?: AgentVersions;
  promptVersions?: PromptVersions;
}

/**
 * Transition options
 */
export interface TransitionOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
  shardId?: string;
  errorType?: string;
}

/**
 * Approval timeout in milliseconds (24 hours)
 */
export const APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Confirmation timeout in milliseconds (48 hours)
 */
export const CONFIRMATION_TIMEOUT_MS = 48 * 60 * 60 * 1000;

/**
 * Convert database TestRun to domain TestRun
 */
function fromDbTestRun(dbRun: any): TestRun {
  return {
    id: dbRun.id,
    projectId: dbRun.projectId,
    state: dbRun.state as TestRunState,
    reasonCode: dbRun.reasonCode as ReasonCode | undefined,
    prdPath: dbRun.prdPath,
    testedRoutes: fromJsonString<string[]>(dbRun.testedRoutes),
    workspacePath: dbRun.workspacePath,
    envFingerprint: fromJsonString<EnvFingerprint>(dbRun.envFingerprint),
    agentVersions: fromJsonString<AgentVersions>(dbRun.agentVersions),
    promptVersions: fromJsonString<PromptVersions>(dbRun.promptVersions),
    decisionLog: fromJsonString<DecisionLogEntry[]>(dbRun.decisionLog),
    qualityMetrics: dbRun.qualityMetrics ? fromJsonString(dbRun.qualityMetrics) : undefined,
    reportPath: dbRun.reportPath ?? undefined,
    createdAt: dbRun.createdAt,
    updatedAt: dbRun.updatedAt,
    completedAt: dbRun.completedAt ?? undefined,
  };
}

/**
 * Orchestrator class
 * Manages test run lifecycle and state transitions
 */
export class Orchestrator {
  private stateMachine: StateMachine;

  constructor() {
    this.stateMachine = new StateMachine();
  }

  /**
   * Create a new test run
   * 
   * @param input - Test run creation input
   * @returns Created test run
   */
  async createRun(input: CreateTestRunInput): Promise<TestRun> {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
    });

    if (!project) {
      throw new Error(`Project with id ${input.projectId} not found`);
    }

    // Generate workspace path
    const runId = crypto.randomUUID();
    const workspacePath = `.ai-test-workspace/${runId}`;

    // Create initial decision log entry
    const initialLogEntry: DecisionLogEntry = {
      timestamp: new Date().toISOString(),
      fromState: 'created' as TestRunState,
      toState: 'created' as TestRunState,
      event: 'START_PARSING' as StateEvent, // Will be updated on first transition
      reason: 'Test run created',
    };

    // Default versions
    const defaultAgentVersions: AgentVersions = {
      claudeCode: 'unknown',
      codex: 'unknown',
    };

    const defaultPromptVersions: PromptVersions = {
      prdParse: 'v1',
      uiTestExecute: 'v1',
      reviewResults: 'v1',
    };

    const defaultEnvFingerprint: EnvFingerprint = {};

    // Create the test run in database
    const dbRun = await prisma.testRun.create({
      data: {
        id: runId,
        projectId: input.projectId,
        state: 'created',
        prdPath: input.prdPath,
        testedRoutes: toJsonString(input.routes),
        workspacePath,
        envFingerprint: toJsonString(input.envFingerprint ?? defaultEnvFingerprint),
        agentVersions: toJsonString(input.agentVersions ?? defaultAgentVersions),
        promptVersions: toJsonString(input.promptVersions ?? defaultPromptVersions),
        decisionLog: toJsonString([initialLogEntry]),
      },
    });

    return fromDbTestRun(dbRun);
  }

  /**
   * Get a test run by ID
   * 
   * @param runId - Test run ID
   * @returns Test run or null if not found
   */
  async getRun(runId: string): Promise<TestRun | null> {
    const dbRun = await prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!dbRun) {
      return null;
    }

    return fromDbTestRun(dbRun);
  }

  /**
   * Get the current state of a test run
   * 
   * @param runId - Test run ID
   * @returns Current state or null if run not found
   */
  async getState(runId: string): Promise<TestRunState | null> {
    const run = await this.getRun(runId);
    return run?.state ?? null;
  }

  /**
   * Transition a test run to a new state
   * 
   * @param runId - Test run ID
   * @param event - State event triggering the transition
   * @param options - Transition options
   * @returns Updated test run
   */
  async transition(
    runId: string,
    event: StateEvent,
    options: TransitionOptions = {}
  ): Promise<TestRun> {
    // Get current run
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Test run with id ${runId} not found`);
    }

    // Attempt state transition
    const result = this.stateMachine.transition(
      run.state,
      event,
      runId,
      options.shardId,
      options.reason,
      options.metadata
    );

    if (!result.success) {
      throw new Error(result.error ?? 'State transition failed');
    }

    // If no-op, return current run without updating
    if (result.isNoOp) {
      return run;
    }

    // Prepare update data
    const updateData: any = {
      state: result.newState,
      updatedAt: new Date(),
    };

    // Add reason code for failed state
    if (result.newState === 'failed') {
      if (event === 'TIMEOUT') {
        updateData.reasonCode = getTimeoutReasonCode(run.state);
      } else if (event === 'ERROR') {
        updateData.reasonCode = getErrorReasonCode(run.state, options.errorType);
      }
    }

    // Add completion timestamp for terminal states
    if (result.newState === 'completed' || result.newState === 'failed') {
      updateData.completedAt = new Date();
    }

    // Update decision log
    if (result.logEntry) {
      const newDecisionLog = [...run.decisionLog, result.logEntry];
      updateData.decisionLog = toJsonString(newDecisionLog);
    }

    // Update the database
    const updatedDbRun = await prisma.testRun.update({
      where: { id: runId },
      data: updateData,
    });

    return fromDbTestRun(updatedDbRun);
  }

  /**
   * Handle approval decision for a test run
   * 
   * @param runId - Test run ID
   * @param decision - Approval decision
   * @returns Updated test run
   */
  async handleApproval(
    runId: string,
    decision: ApprovalDecision
  ): Promise<TestRun> {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Test run with id ${runId} not found`);
    }

    if (run.state !== 'awaiting_approval') {
      throw new Error(`Cannot approve test run in state: ${run.state}`);
    }

    const event: StateEvent = decision.approved ? 'APPROVED' : 'REJECTED';
    
    return this.transition(runId, event, {
      reason: decision.comments,
      metadata: {
        reviewerId: decision.reviewerId,
        approved: decision.approved,
        timestamp: decision.timestamp,
      },
    });
  }

  /**
   * Handle confirmation decision for a test run
   * 
   * @param runId - Test run ID
   * @param decision - Confirmation decision
   * @returns Updated test run
   */
  async handleConfirmation(
    runId: string,
    decision: ConfirmationDecision
  ): Promise<TestRun> {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Test run with id ${runId} not found`);
    }

    if (run.state !== 'report_ready') {
      throw new Error(`Cannot confirm test run in state: ${run.state}`);
    }

    let event: StateEvent;
    if (decision.retest) {
      event = 'RETEST';
    } else if (decision.confirmed) {
      event = 'CONFIRMED';
    } else {
      throw new Error('Invalid confirmation decision: must be confirmed or retest');
    }

    return this.transition(runId, event, {
      reason: decision.comments,
      metadata: {
        reviewerId: decision.reviewerId,
        confirmed: decision.confirmed,
        retest: decision.retest,
        timestamp: decision.timestamp,
      },
    });
  }

  /**
   * Check for approval timeout and transition to failed if needed
   * 
   * @param runId - Test run ID
   * @returns Updated test run if timeout occurred, null otherwise
   */
  async checkApprovalTimeout(runId: string): Promise<TestRun | null> {
    const run = await this.getRun(runId);
    if (!run || run.state !== 'awaiting_approval') {
      return null;
    }

    // Find when we entered awaiting_approval state
    const approvalEntry = [...run.decisionLog]
      .reverse()
      .find(entry => entry.toState === 'awaiting_approval');

    if (!approvalEntry) {
      return null;
    }

    const enteredAt = new Date(approvalEntry.timestamp);
    const now = new Date();
    const elapsed = now.getTime() - enteredAt.getTime();

    if (elapsed >= APPROVAL_TIMEOUT_MS) {
      return this.transition(runId, 'TIMEOUT', {
        reason: 'Approval timeout (24 hours)',
      });
    }

    return null;
  }

  /**
   * Check for confirmation timeout and transition to failed if needed
   * 
   * @param runId - Test run ID
   * @returns Updated test run if timeout occurred, null otherwise
   */
  async checkConfirmationTimeout(runId: string): Promise<TestRun | null> {
    const run = await this.getRun(runId);
    if (!run || run.state !== 'report_ready') {
      return null;
    }

    // Find when we entered report_ready state
    const reportReadyEntry = [...run.decisionLog]
      .reverse()
      .find(entry => entry.toState === 'report_ready');

    if (!reportReadyEntry) {
      return null;
    }

    const enteredAt = new Date(reportReadyEntry.timestamp);
    const now = new Date();
    const elapsed = now.getTime() - enteredAt.getTime();

    if (elapsed >= CONFIRMATION_TIMEOUT_MS) {
      return this.transition(runId, 'TIMEOUT', {
        reason: 'Confirmation timeout (48 hours)',
      });
    }

    return null;
  }

  /**
   * Get all test runs for a project
   * 
   * @param projectId - Project ID
   * @returns List of test runs
   */
  async getRunsForProject(projectId: string): Promise<TestRun[]> {
    const dbRuns = await prisma.testRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return dbRuns.map(fromDbTestRun);
  }

  /**
   * Get test runs by state
   * 
   * @param state - State to filter by
   * @returns List of test runs in the specified state
   */
  async getRunsByState(state: TestRunState): Promise<TestRun[]> {
    const dbRuns = await prisma.testRun.findMany({
      where: { state },
      orderBy: { createdAt: 'desc' },
    });

    return dbRuns.map(fromDbTestRun);
  }

  /**
   * Update test run with quality metrics
   * 
   * @param runId - Test run ID
   * @param qualityMetrics - Quality metrics to set
   * @returns Updated test run
   */
  async updateQualityMetrics(
    runId: string,
    qualityMetrics: any
  ): Promise<TestRun> {
    const dbRun = await prisma.testRun.update({
      where: { id: runId },
      data: {
        qualityMetrics: toJsonString(qualityMetrics),
        updatedAt: new Date(),
      },
    });

    return fromDbTestRun(dbRun);
  }

  /**
   * Update test run with report path
   * 
   * @param runId - Test run ID
   * @param reportPath - Path to the generated report
   * @returns Updated test run
   */
  async updateReportPath(runId: string, reportPath: string): Promise<TestRun> {
    const dbRun = await prisma.testRun.update({
      where: { id: runId },
      data: {
        reportPath,
        updatedAt: new Date(),
      },
    });

    return fromDbTestRun(dbRun);
  }

  /**
   * Clear idempotency keys for a run (useful for testing)
   */
  clearIdempotencyKeysForRun(runId: string): void {
    this.stateMachine.clearKeysForRun(runId);
  }

  /**
   * Clear all idempotency keys (useful for testing)
   */
  clearAllIdempotencyKeys(): void {
    this.stateMachine.clearAllKeys();
  }
}

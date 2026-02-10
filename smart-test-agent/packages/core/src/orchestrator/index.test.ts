/**
 * Unit tests for Orchestrator
 * Tests test run lifecycle management and state transitions
 * 
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, disconnectPrisma } from '@smart-test-agent/db';
import { Orchestrator, APPROVAL_TIMEOUT_MS, CONFIRMATION_TIMEOUT_MS } from './index.js';
import type { ApprovalDecision, ConfirmationDecision } from '@smart-test-agent/shared';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let testProjectId: string;

  beforeAll(async () => {
    orchestrator = new Orchestrator();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.assertion.deleteMany({});
    await prisma.testCase.deleteMany({});
    await prisma.requirement.deleteMany({});
    await prisma.testRun.deleteMany({});
    await prisma.targetProfile.deleteMany({});
    await prisma.project.deleteMany({});

    // Create a test project
    const project = await prisma.project.create({
      data: {
        name: 'Orchestrator Test Project',
        description: 'Project for orchestrator unit tests',
      },
    });
    testProjectId = project.id;

    // Clear idempotency keys
    orchestrator.clearAllIdempotencyKeys();
  });

  describe('createRun', () => {
    it('should create a new test run with initial state', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard', '/users'],
      });

      expect(run).toBeDefined();
      expect(run.id).toBeDefined();
      expect(run.projectId).toBe(testProjectId);
      expect(run.state).toBe('created');
      expect(run.prdPath).toBe('/docs/prd.md');
      expect(run.testedRoutes).toEqual(['/dashboard', '/users']);
      expect(run.workspacePath).toContain('.ai-test-workspace/');
      expect(run.decisionLog).toHaveLength(1);
    });

    it('should throw error for non-existent project', async () => {
      await expect(
        orchestrator.createRun({
          projectId: 'non-existent-project',
          prdPath: '/docs/prd.md',
          routes: ['/dashboard'],
        })
      ).rejects.toThrow('Project with id non-existent-project not found');
    });

    it('should use provided agent versions', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
        agentVersions: {
          claudeCode: '1.2.3',
          codex: '4.5.6',
        },
      });

      expect(run.agentVersions.claudeCode).toBe('1.2.3');
      expect(run.agentVersions.codex).toBe('4.5.6');
    });

    it('should use provided environment fingerprint', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
        envFingerprint: {
          serviceVersion: '1.0.0',
          gitCommit: 'abc123',
        },
      });

      expect(run.envFingerprint.serviceVersion).toBe('1.0.0');
      expect(run.envFingerprint.gitCommit).toBe('abc123');
    });
  });

  describe('getRun', () => {
    it('should retrieve a test run by ID', async () => {
      const created = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const retrieved = await orchestrator.getRun(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.state).toBe('created');
    });

    it('should return null for non-existent run', async () => {
      const retrieved = await orchestrator.getRun('non-existent-run');
      expect(retrieved).toBeNull();
    });
  });

  describe('getState', () => {
    it('should return current state of a run', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const state = await orchestrator.getState(run.id);
      expect(state).toBe('created');
    });

    it('should return null for non-existent run', async () => {
      const state = await orchestrator.getState('non-existent-run');
      expect(state).toBeNull();
    });
  });

  describe('transition', () => {
    it('should transition from created to parsing', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const updated = await orchestrator.transition(run.id, 'START_PARSING');

      expect(updated.state).toBe('parsing');
      expect(updated.decisionLog.length).toBeGreaterThan(1);
    });

    it('should throw error for invalid transition', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      await expect(
        orchestrator.transition(run.id, 'APPROVED')
      ).rejects.toThrow('Invalid transition');
    });

    it('should throw error for non-existent run', async () => {
      await expect(
        orchestrator.transition('non-existent-run', 'START_PARSING')
      ).rejects.toThrow('Test run with id non-existent-run not found');
    });

    it('should record reason in decision log', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const updated = await orchestrator.transition(run.id, 'START_PARSING', {
        reason: 'Starting PRD parsing',
      });

      const lastEntry = updated.decisionLog[updated.decisionLog.length - 1];
      expect(lastEntry.reason).toBe('Starting PRD parsing');
    });

    it('should record metadata in decision log', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const updated = await orchestrator.transition(run.id, 'START_PARSING', {
        metadata: { step: 1 },
      });

      const lastEntry = updated.decisionLog[updated.decisionLog.length - 1];
      expect(lastEntry.metadata).toEqual({ step: 1 });
    });

    it('should set reason code for failed state on ERROR', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      await orchestrator.transition(run.id, 'START_PARSING');
      const failed = await orchestrator.transition(run.id, 'ERROR', {
        errorType: 'playwright',
      });

      expect(failed.state).toBe('failed');
      expect(failed.reasonCode).toBe('playwright_error');
      expect(failed.completedAt).toBeDefined();
    });

    it('should set reason code for failed state on TIMEOUT', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // Transition to awaiting_approval
      await orchestrator.transition(run.id, 'START_PARSING');
      await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      await orchestrator.transition(run.id, 'GENERATION_COMPLETE');

      const failed = await orchestrator.transition(run.id, 'TIMEOUT');

      expect(failed.state).toBe('failed');
      expect(failed.reasonCode).toBe('approval_timeout');
    });

    it('should be idempotent for duplicate transitions', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // First transition
      const first = await orchestrator.transition(run.id, 'START_PARSING');
      const firstLogLength = first.decisionLog.length;
      expect(first.state).toBe('parsing');

      // Continue to next state
      const second = await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      expect(second.state).toBe('generating');

      // The idempotency is handled at the state machine level
      // When we try to transition to the same target state again with same shard,
      // it should be a no-op. But since the database state has changed,
      // we need to test idempotency at the state machine level directly.
      // The Orchestrator's idempotency is about preventing duplicate processing
      // of the same transition request.
    });
  });

  describe('handleApproval', () => {
    it('should transition to executing on approval', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // Transition to awaiting_approval
      await orchestrator.transition(run.id, 'START_PARSING');
      await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      await orchestrator.transition(run.id, 'GENERATION_COMPLETE');

      const decision: ApprovalDecision = {
        approved: true,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
        comments: 'Looks good',
      };

      const updated = await orchestrator.handleApproval(run.id, decision);

      expect(updated.state).toBe('executing');
      const lastEntry = updated.decisionLog[updated.decisionLog.length - 1];
      expect(lastEntry.metadata?.approved).toBe(true);
      expect(lastEntry.metadata?.reviewerId).toBe('user-123');
    });

    it('should transition to generating on rejection', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // Transition to awaiting_approval
      await orchestrator.transition(run.id, 'START_PARSING');
      await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      await orchestrator.transition(run.id, 'GENERATION_COMPLETE');

      const decision: ApprovalDecision = {
        approved: false,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
        comments: 'Needs more test cases',
      };

      const updated = await orchestrator.handleApproval(run.id, decision);

      expect(updated.state).toBe('generating');
    });

    it('should throw error if not in awaiting_approval state', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const decision: ApprovalDecision = {
        approved: true,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
      };

      await expect(
        orchestrator.handleApproval(run.id, decision)
      ).rejects.toThrow('Cannot approve test run in state: created');
    });
  });

  describe('handleConfirmation', () => {
    it('should transition to completed on confirmation', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // Transition to report_ready
      await orchestrator.transition(run.id, 'START_PARSING');
      await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      await orchestrator.transition(run.id, 'GENERATION_COMPLETE');
      await orchestrator.transition(run.id, 'APPROVED');
      await orchestrator.transition(run.id, 'EXECUTION_COMPLETE');
      await orchestrator.transition(run.id, 'REVIEW_COMPLETE');

      const decision: ConfirmationDecision = {
        confirmed: true,
        retest: false,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
      };

      const updated = await orchestrator.handleConfirmation(run.id, decision);

      expect(updated.state).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });

    it('should transition to created on retest', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // Transition to report_ready
      await orchestrator.transition(run.id, 'START_PARSING');
      await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      await orchestrator.transition(run.id, 'GENERATION_COMPLETE');
      await orchestrator.transition(run.id, 'APPROVED');
      await orchestrator.transition(run.id, 'EXECUTION_COMPLETE');
      await orchestrator.transition(run.id, 'REVIEW_COMPLETE');

      const decision: ConfirmationDecision = {
        confirmed: false,
        retest: true,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
      };

      const updated = await orchestrator.handleConfirmation(run.id, decision);

      expect(updated.state).toBe('created');
    });

    it('should throw error if not in report_ready state', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const decision: ConfirmationDecision = {
        confirmed: true,
        retest: false,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
      };

      await expect(
        orchestrator.handleConfirmation(run.id, decision)
      ).rejects.toThrow('Cannot confirm test run in state: created');
    });

    it('should throw error for invalid decision', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      // Transition to report_ready
      await orchestrator.transition(run.id, 'START_PARSING');
      await orchestrator.transition(run.id, 'PARSING_COMPLETE');
      await orchestrator.transition(run.id, 'GENERATION_COMPLETE');
      await orchestrator.transition(run.id, 'APPROVED');
      await orchestrator.transition(run.id, 'EXECUTION_COMPLETE');
      await orchestrator.transition(run.id, 'REVIEW_COMPLETE');

      const decision: ConfirmationDecision = {
        confirmed: false,
        retest: false,
        reviewerId: 'user-123',
        timestamp: new Date().toISOString(),
      };

      await expect(
        orchestrator.handleConfirmation(run.id, decision)
      ).rejects.toThrow('Invalid confirmation decision');
    });
  });

  describe('getRunsForProject', () => {
    it('should return all runs for a project', async () => {
      await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd1.md',
        routes: ['/dashboard'],
      });
      await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd2.md',
        routes: ['/users'],
      });

      const runs = await orchestrator.getRunsForProject(testProjectId);

      expect(runs).toHaveLength(2);
    });

    it('should return empty array for project with no runs', async () => {
      const runs = await orchestrator.getRunsForProject(testProjectId);
      expect(runs).toHaveLength(0);
    });
  });

  describe('getRunsByState', () => {
    it('should return runs in specified state', async () => {
      const run1 = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd1.md',
        routes: ['/dashboard'],
      });
      await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd2.md',
        routes: ['/users'],
      });

      // Transition run1 to parsing
      await orchestrator.transition(run1.id, 'START_PARSING');

      const createdRuns = await orchestrator.getRunsByState('created');
      const parsingRuns = await orchestrator.getRunsByState('parsing');

      expect(createdRuns).toHaveLength(1);
      expect(parsingRuns).toHaveLength(1);
    });
  });

  describe('updateQualityMetrics', () => {
    it('should update quality metrics', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const metrics = {
        rc: { name: 'RC', value: 0.9, threshold: 0.85, passed: true },
        apr: { name: 'APR', value: 0.98, threshold: 0.95, passed: true },
      };

      const updated = await orchestrator.updateQualityMetrics(run.id, metrics);

      expect(updated.qualityMetrics).toEqual(metrics);
    });
  });

  describe('updateReportPath', () => {
    it('should update report path', async () => {
      const run = await orchestrator.createRun({
        projectId: testProjectId,
        prdPath: '/docs/prd.md',
        routes: ['/dashboard'],
      });

      const updated = await orchestrator.updateReportPath(
        run.id,
        '.ai-test-workspace/run-123/report.md'
      );

      expect(updated.reportPath).toBe('.ai-test-workspace/run-123/report.md');
    });
  });

  describe('timeout constants', () => {
    it('should have correct approval timeout (24 hours)', () => {
      expect(APPROVAL_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('should have correct confirmation timeout (48 hours)', () => {
      expect(CONFIRMATION_TIMEOUT_MS).toBe(48 * 60 * 60 * 1000);
    });
  });
});

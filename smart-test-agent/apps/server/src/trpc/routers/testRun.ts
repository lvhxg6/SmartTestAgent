/**
 * Test Run Router
 * Handles test run operations with Prisma database and Orchestrator integration
 * @see Requirements 6.2, 6.3, 6.4, 12.2, 12.3, 12.4, 17.4
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { prisma, toJsonString, fromJsonString, fromJsonStringNullable } from '@smart-test-agent/db';
import { getPipelineRunner } from '../../services/pipeline-runner.js';
import { RESUMABLE_STEP_ORDER } from '@smart-test-agent/core';

/**
 * Test run state enum
 * @see Requirements 13.1, 14.1
 */
const testRunStateSchema = z.enum([
  'created',
  'parsing',
  'generating',
  'awaiting_approval',
  'executing',
  'codex_reviewing',
  'report_ready',
  'completed',
  'failed',
]);

/**
 * Reason code enum
 * @see Requirements 13.2, 14.2
 */
const reasonCodeSchema = z.enum([
  'retry_exhausted',
  'agent_timeout',
  'approval_timeout',
  'confirm_timeout',
  'verdict_conflict',
  'playwright_error',
  'internal_error',
]);

/**
 * Create test run input schema
 */
const createTestRunInputSchema = z.object({
  projectId: z.string().uuid(),
  prdPath: z.string(),
  routes: z.array(z.string()).min(1, 'At least one route is required'),
});

/**
 * List options schema
 */
const listOptionsSchema = z.object({
  projectId: z.string().uuid().optional(),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(100).default(20),
  state: testRunStateSchema.optional(),
});

/**
 * Approval decision schema
 * @see Requirements 6.3, 6.4
 */
const approvalDecisionSchema = z.object({
  runId: z.string().uuid(),
  approved: z.boolean(),
  comments: z.string().optional(),
  reviewerId: z.string(),
});

/**
 * Confirmation decision schema
 * @see Requirements 12.3, 12.4
 */
const confirmationDecisionSchema = z.object({
  runId: z.string().uuid(),
  confirmed: z.boolean(),
  retest: z.boolean(),
  comments: z.string().optional(),
  reviewerId: z.string(),
});

export type TestRunState = z.infer<typeof testRunStateSchema>;
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
export type CreateTestRunInput = z.infer<typeof createTestRunInputSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type ConfirmationDecision = z.infer<typeof confirmationDecisionSchema>;

/**
 * Test run output type
 */
export interface TestRun {
  id: string;
  projectId: string;
  state: TestRunState;
  reasonCode: ReasonCode | null;
  prdPath: string;
  testedRoutes: string[];
  workspacePath: string;
  envFingerprint: Record<string, string>;
  agentVersions: Record<string, string>;
  promptVersions: Record<string, string>;
  decisionLog: Array<{ timestamp: string; action: string; details?: string }>;
  qualityMetrics: Record<string, any> | null;
  reportPath: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/**
 * Convert database record to API response format
 */
function dbToApiFormat(dbRecord: any): TestRun {
  return {
    id: dbRecord.id,
    projectId: dbRecord.projectId,
    state: dbRecord.state as TestRunState,
    reasonCode: dbRecord.reasonCode as ReasonCode | null,
    prdPath: dbRecord.prdPath,
    testedRoutes: fromJsonString(dbRecord.testedRoutes),
    workspacePath: dbRecord.workspacePath,
    envFingerprint: fromJsonString(dbRecord.envFingerprint),
    agentVersions: fromJsonString(dbRecord.agentVersions),
    promptVersions: fromJsonString(dbRecord.promptVersions),
    decisionLog: fromJsonString(dbRecord.decisionLog),
    qualityMetrics: fromJsonStringNullable(dbRecord.qualityMetrics),
    reportPath: dbRecord.reportPath,
    createdAt: dbRecord.createdAt,
    updatedAt: dbRecord.updatedAt,
    completedAt: dbRecord.completedAt,
  };
}

/**
 * Add entry to decision log
 */
function addDecisionLogEntry(
  currentLog: string,
  action: string,
  details?: string
): string {
  const log = fromJsonString<Array<{ timestamp: string; action: string; details?: string }>>(currentLog);
  log.push({
    timestamp: new Date().toISOString(),
    action,
    details,
  });
  return toJsonString(log);
}

/**
 * Test run router with Prisma database integration
 */
export const testRunRouter = router({
  /**
   * List test runs for a project (or all if no projectId)
   */
  list: publicProcedure
    .input(listOptionsSchema)
    .query(async ({ input }) => {
      const { projectId, skip, take, state } = input;

      // If projectId provided, check if project exists
      if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });

        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Project with id ${projectId} not found`,
          });
        }
      }

      // Build where clause
      const where: any = {};
      if (projectId) {
        where.projectId = projectId;
      }
      if (state) {
        where.state = state;
      }

      // Get total count
      const total = await prisma.testRun.count({ where });

      // Get test runs
      const runs = await prisma.testRun.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      });

      return {
        items: runs.map(dbToApiFormat),
        total,
        skip,
        take,
        hasMore: skip + take < total,
      };
    }),

  /**
   * Get a single test run by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const run = await prisma.testRun.findUnique({
        where: { id: input.id },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.id} not found`,
        });
      }

      return dbToApiFormat(run);
    }),

  /**
   * Get test run status (lightweight query)
   */
  getStatus: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const run = await prisma.testRun.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          state: true,
          reasonCode: true,
          updatedAt: true,
          completedAt: true,
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.id} not found`,
        });
      }

      return {
        id: run.id,
        state: run.state as TestRunState,
        reasonCode: run.reasonCode as ReasonCode | null,
        updatedAt: run.updatedAt,
        completedAt: run.completedAt,
      };
    }),

  /**
   * Create a new test run
   */
  create: publicProcedure
    .input(createTestRunInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if project exists
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.projectId} not found`,
        });
      }

      // Check if target profile exists
      const profile = await prisma.targetProfile.findUnique({
        where: { projectId: input.projectId },
      });

      if (!profile) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Target profile for project ${input.projectId} not found. Please configure target profile first.`,
        });
      }

      const now = new Date();
      const runId = crypto.randomUUID();
      const workspacePath = `.ai-test-workspace/${runId}`;

      // Create initial decision log
      const decisionLog = [
        {
          timestamp: now.toISOString(),
          action: 'created',
          details: `Test run created for routes: ${input.routes.join(', ')}`,
        },
      ];

      // Create test run in database
      const run = await prisma.testRun.create({
        data: {
          id: runId,
          projectId: input.projectId,
          state: 'created',
          prdPath: input.prdPath,
          testedRoutes: toJsonString(input.routes),
          workspacePath,
          envFingerprint: toJsonString({
            service_version: process.env.npm_package_version || '0.1.0',
            git_commit: process.env.GIT_COMMIT || 'unknown',
            config_hash: 'pending',
            browser_version: 'pending',
          }),
          agentVersions: toJsonString({
            claudeCode: 'pending',
            codex: 'pending',
          }),
          promptVersions: toJsonString({
            prdParse: '1.0.0',
            uiTestExecute: '1.0.0',
            reviewResults: '1.0.0',
          }),
          decisionLog: toJsonString(decisionLog),
        },
      });

      // Emit WebSocket event for new test run
      if (ctx.io) {
        ctx.io.emit('test-run:created', {
          runId,
          projectId: input.projectId,
          state: 'created',
          timestamp: now.toISOString(),
        });

        // Initialize pipeline runner with Socket.IO
        const pipelineRunner = getPipelineRunner();
        pipelineRunner.setSocketIO(ctx.io);

        // Start pipeline execution in background (non-blocking)
        pipelineRunner.startPipeline(runId).catch((error) => {
          console.error(`[testRun.create] Failed to start pipeline for run ${runId}:`, error);
        });
      }

      return dbToApiFormat(run);
    }),

  /**
   * Submit approval decision
   * @see Requirements 6.3, 6.4
   */
  submitApproval: publicProcedure
    .input(approvalDecisionSchema)
    .mutation(async ({ input, ctx }) => {
      // Get current test run
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // Validate current state
      if (run.state !== 'awaiting_approval') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Test run is in state "${run.state}", expected "awaiting_approval"`,
        });
      }

      const now = new Date();
      const newState = input.approved ? 'executing' : 'generating';

      // Update decision log
      const updatedLog = addDecisionLogEntry(
        run.decisionLog,
        input.approved ? 'approval_granted' : 'approval_rejected',
        `Reviewer: ${input.reviewerId}${input.comments ? `, Comments: ${input.comments}` : ''}`
      );

      // Update test run
      await prisma.testRun.update({
        where: { id: input.runId },
        data: {
          state: newState,
          decisionLog: updatedLog,
        },
      });

      // Emit WebSocket event
      if (ctx.io) {
        ctx.io.to(`run:${input.runId}`).emit('state_transition', {
          runId: input.runId,
          previousState: 'awaiting_approval',
          currentState: newState,
          timestamp: now.toISOString(),
        });
      }

      return {
        success: true,
        newState,
        timestamp: now.toISOString(),
      };
    }),

  /**
   * Submit confirmation decision
   * @see Requirements 12.3, 12.4
   */
  submitConfirmation: publicProcedure
    .input(confirmationDecisionSchema)
    .mutation(async ({ input, ctx }) => {
      // Get current test run
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // Validate current state
      if (run.state !== 'report_ready') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Test run is in state "${run.state}", expected "report_ready"`,
        });
      }

      const now = new Date();
      let newState: TestRunState;
      let action: string;

      if (input.confirmed) {
        newState = 'completed';
        action = 'report_confirmed';
      } else if (input.retest) {
        newState = 'created';
        action = 'retest_requested';
      } else {
        newState = 'report_ready';
        action = 'confirmation_deferred';
      }

      // Update decision log
      const updatedLog = addDecisionLogEntry(
        run.decisionLog,
        action,
        `Reviewer: ${input.reviewerId}${input.comments ? `, Comments: ${input.comments}` : ''}`
      );

      // Update test run
      const updateData: any = {
        state: newState,
        decisionLog: updatedLog,
      };

      if (newState === 'completed') {
        updateData.completedAt = now;
      }

      await prisma.testRun.update({
        where: { id: input.runId },
        data: updateData,
      });

      // Emit WebSocket event
      if (ctx.io) {
        ctx.io.to(`run:${input.runId}`).emit('state_transition', {
          runId: input.runId,
          previousState: 'report_ready',
          currentState: newState,
          timestamp: now.toISOString(),
        });
      }

      return {
        success: true,
        newState,
        timestamp: now.toISOString(),
      };
    }),

  /**
   * Cancel a test run
   */
  cancel: publicProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const run = await prisma.testRun.findUnique({
        where: { id: input.id },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.id} not found`,
        });
      }

      // Cannot cancel completed or failed runs
      if (run.state === 'completed' || run.state === 'failed') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot cancel test run in state "${run.state}"`,
        });
      }

      const now = new Date();

      // Update decision log
      const updatedLog = addDecisionLogEntry(
        run.decisionLog,
        'cancelled',
        input.reason || 'User cancelled'
      );

      // Update test run
      await prisma.testRun.update({
        where: { id: input.id },
        data: {
          state: 'failed',
          reasonCode: 'internal_error',
          decisionLog: updatedLog,
          completedAt: now,
        },
      });

      // Emit WebSocket event
      if (ctx.io) {
        ctx.io.to(`run:${input.id}`).emit('state_transition', {
          runId: input.id,
          previousState: run.state,
          currentState: 'failed',
          reasonCode: 'internal_error',
          timestamp: now.toISOString(),
        });
      }

      return {
        success: true,
        timestamp: now.toISOString(),
      };
    }),

  /**
   * Get test run statistics for a project
   */
  getStats: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [total, completed, failed, inProgress] = await Promise.all([
        prisma.testRun.count({ where: { projectId: input.projectId } }),
        prisma.testRun.count({ where: { projectId: input.projectId, state: 'completed' } }),
        prisma.testRun.count({ where: { projectId: input.projectId, state: 'failed' } }),
        prisma.testRun.count({
          where: {
            projectId: input.projectId,
            state: { notIn: ['completed', 'failed'] },
          },
        }),
      ]);

      return {
        total,
        completed,
        failed,
        inProgress,
        successRate: total > 0 ? completed / total : 0,
      };
    }),

  /**
   * 获取可恢复的步骤列表
   * @see Requirements 3.1
   */
  getResumableSteps: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // 验证 TestRun 存在
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // 获取可恢复步骤
      const pipelineRunner = getPipelineRunner();
      const steps = await pipelineRunner.getResumableSteps(input.runId);

      return {
        runId: input.runId,
        currentState: run.state,
        steps,
      };
    }),

  /**
   * 恢复执行 Pipeline
   * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
   */
  resumeRun: publicProcedure
    .input(z.object({
      runId: z.string().uuid(),
      fromStep: z.enum([
        'prd_parsing',
        'test_execution',
        'codex_review',
        'cross_validation',
        'report_generation',
        'quality_gate',
      ]),
    }))
    .mutation(async ({ input, ctx }) => {
      // 验证 TestRun 存在
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // 验证状态允许恢复
      if (run.state === 'executing' || run.state === 'codex_reviewing') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Test run is already running (state: ${run.state})`,
        });
      }

      const pipelineRunner = getPipelineRunner();

      // 设置 Socket.IO（如果可用）
      if (ctx.io) {
        pipelineRunner.setSocketIO(ctx.io);
      }

      try {
        // 恢复执行 Pipeline
        await pipelineRunner.resumePipeline(input.runId, input.fromStep);

        // 更新 decision log
        const updatedLog = addDecisionLogEntry(
          run.decisionLog,
          'pipeline_resumed',
          `Resumed from step: ${input.fromStep}`
        );

        await prisma.testRun.update({
          where: { id: input.runId },
          data: {
            decisionLog: updatedLog,
          },
        });

        // Emit WebSocket event
        if (ctx.io) {
          ctx.io.to(`run:${input.runId}`).emit('pipeline:resumed', {
            runId: input.runId,
            fromStep: input.fromStep,
            timestamp: new Date().toISOString(),
          });
        }

        return {
          success: true,
          runId: input.runId,
          fromStep: input.fromStep,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // 根据错误类型返回适当的错误码
        if (errorMessage.includes('not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: errorMessage,
          });
        } else if (errorMessage.includes('Missing prerequisite files')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: errorMessage,
          });
        } else if (errorMessage.includes('already running')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: errorMessage,
          });
        } else {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: errorMessage,
          });
        }
      }
    }),
});

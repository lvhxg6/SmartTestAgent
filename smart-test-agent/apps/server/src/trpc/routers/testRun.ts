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

/**
 * Feedback type enum for test case regeneration
 * @see Requirements 5.1, 5.4
 */
const feedbackTypeSchema = z.enum([
  'coverage_incomplete',    // 测试用例覆盖不全
  'steps_incorrect',        // 测试步骤不正确
  'assertions_inaccurate',  // 断言不准确
  'other',                  // 其他
]);

/**
 * Regenerate test cases input schema
 * @see Requirements 5.1, 5.4, 5.5
 */
const regenerateInputSchema = z.object({
  runId: z.string().uuid(),
  feedbackType: feedbackTypeSchema,
  feedbackDetail: z.string().min(1, '请提供具体的反馈意见'),
  reviewerId: z.string(),
});

/** Maximum regeneration attempts allowed */
const MAX_REGENERATION_ATTEMPTS = 3;

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

        // If approved, continue pipeline execution
        if (input.approved) {
          const pipelineRunner = getPipelineRunner();
          pipelineRunner.setSocketIO(ctx.io);
          
          // Continue pipeline execution in background (non-blocking)
          pipelineRunner.continueAfterApproval(input.runId).catch((error) => {
            console.error(`[testRun.submitApproval] Failed to continue pipeline for run ${input.runId}:`, error);
          });
        }
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
   * 获取测试用例列表
   * @see Requirements 2.1, 2.2, 2.3, 8.1
   */
  getTestCases: publicProcedure
    .input(z.object({
      runId: z.string().uuid(),
      requirementId: z.string().optional(),
    }))
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

      // 获取工作目录路径
      const workspaceRoot = process.env.WORKSPACE_DIR || '.ai-test-workspace';
      const outputsDir = `${workspaceRoot}/${input.runId}/outputs`;
      const testCasesPath = `${outputsDir}/test-cases.json`;
      const testCasesDir = `${outputsDir}/test-cases`;

      const fs = await import('fs/promises');
      const path = await import('path');

      let testCases: any[] = [];

      // 尝试读取 test-cases.json
      try {
        const content = await fs.readFile(testCasesPath, 'utf-8');
        const parsed = JSON.parse(content);
        testCases = Array.isArray(parsed) ? parsed : (parsed.test_cases || parsed.testCases || []);
      } catch {
        // 如果 test-cases.json 不存在，尝试读取 test-cases/ 目录
        try {
          const files = await fs.readdir(testCasesDir);
          const reqFiles = files.filter((f: string) => f.startsWith('REQ-') && f.endsWith('.json'));
          
          for (const reqFile of reqFiles) {
            try {
              const filePath = path.join(testCasesDir, reqFile);
              const content = await fs.readFile(filePath, 'utf-8');
              const parsed = JSON.parse(content);
              
              if (Array.isArray(parsed)) {
                testCases.push(...parsed);
              } else if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
                testCases.push(...parsed.test_cases);
              } else if (parsed.testCases && Array.isArray(parsed.testCases)) {
                testCases.push(...parsed.testCases);
              }
            } catch (e) {
              console.warn(`[getTestCases] 无法解析测试用例文件 ${reqFile}:`, e);
            }
          }
        } catch {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Test cases file not found',
          });
        }
      }

      // 按需求 ID 筛选
      if (input.requirementId) {
        testCases = testCases.filter((tc: any) => tc.requirement_id === input.requirementId);
      }

      // 按需求分组
      const byRequirement: Record<string, any[]> = {};
      for (const tc of testCases) {
        const reqId = tc.requirement_id || 'unknown';
        if (!byRequirement[reqId]) {
          byRequirement[reqId] = [];
        }
        byRequirement[reqId].push(tc);
      }

      return {
        testCases,
        total: testCases.length,
        byRequirement,
      };
    }),

  /**
   * 获取需求列表
   * @see Requirements 3.1, 3.2, 3.4, 8.2
   */
  getRequirements: publicProcedure
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

      // 获取工作目录路径
      const workspaceRoot = process.env.WORKSPACE_DIR || '.ai-test-workspace';
      const requirementsPath = `${workspaceRoot}/${input.runId}/outputs/requirements.json`;

      const fs = await import('fs/promises');

      let requirements: any[] = [];

      try {
        const content = await fs.readFile(requirementsPath, 'utf-8');
        const parsed = JSON.parse(content);
        requirements = parsed.requirements || (Array.isArray(parsed) ? parsed : []);
      } catch {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Requirements file not found',
        });
      }

      // 按优先级分组
      const byPriority: { P0: any[]; P1: any[]; P2: any[] } = {
        P0: [],
        P1: [],
        P2: [],
      };

      for (const req of requirements) {
        const priority = req.priority || 'P2';
        if (priority === 'P0') {
          byPriority.P0.push(req);
        } else if (priority === 'P1') {
          byPriority.P1.push(req);
        } else {
          byPriority.P2.push(req);
        }
      }

      // 按优先级排序
      requirements.sort((a: any, b: any) => {
        const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
      });

      return {
        requirements,
        total: requirements.length,
        byPriority,
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

  /**
   * 基于反馈重新生成测试用例
   * @see Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 8.5
   */
  regenerateTestCases: publicProcedure
    .input(regenerateInputSchema)
    .mutation(async ({ input, ctx }) => {
      // 1. 验证 TestRun 存在
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // 2. 验证状态为 awaiting_approval
      if (run.state !== 'awaiting_approval') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Test run is in state "${run.state}", expected "awaiting_approval"`,
        });
      }

      // 3. 检查重新生成次数
      const decisionLog = fromJsonString<Array<{ timestamp: string; action: string; details?: string }>>(run.decisionLog);
      const regenerationCount = decisionLog.filter(
        (entry) => entry.action === 'regeneration_requested'
      ).length;

      if (regenerationCount >= MAX_REGENERATION_ATTEMPTS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Maximum regeneration attempts (${MAX_REGENERATION_ATTEMPTS}) reached. Please manually edit test cases or force continue.`,
        });
      }

      const now = new Date();

      // 4. 记录反馈到 decision_log
      const updatedLog = addDecisionLogEntry(
        run.decisionLog,
        'regeneration_requested',
        JSON.stringify({
          feedbackType: input.feedbackType,
          feedbackDetail: input.feedbackDetail,
          reviewerId: input.reviewerId,
          regenerationCount: regenerationCount + 1,
        })
      );

      // 5. 更新状态为 generating
      await prisma.testRun.update({
        where: { id: input.runId },
        data: {
          state: 'generating',
          decisionLog: updatedLog,
        },
      });

      // 6. Emit WebSocket event
      if (ctx.io) {
        ctx.io.to(`run:${input.runId}`).emit('state_transition', {
          runId: input.runId,
          previousState: 'awaiting_approval',
          currentState: 'generating',
          timestamp: now.toISOString(),
        });

        // 7. 调用 PipelineRunner 重新生成测试用例
        const pipelineRunner = getPipelineRunner();
        pipelineRunner.setSocketIO(ctx.io);

        // 在后台执行重新生成（非阻塞）
        pipelineRunner.regenerateTestCases(input.runId, {
          feedbackType: input.feedbackType,
          feedbackDetail: input.feedbackDetail,
        }).catch((error) => {
          console.error(`[testRun.regenerateTestCases] Failed to regenerate for run ${input.runId}:`, error);
        });
      }

      return {
        success: true,
        regenerationCount: regenerationCount + 1,
        maxAttempts: MAX_REGENERATION_ATTEMPTS,
        timestamp: now.toISOString(),
      };
    }),

  /**
   * 生成 Playwright 脚本预览
   * @see Requirements 6.1, 6.3, 8.3
   */
  generateScript: publicProcedure
    .input(z.object({
      runId: z.string().uuid(),
      caseIds: z.array(z.string()).optional(),
    }))
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

      // 获取 target profile
      const targetProfile = await prisma.targetProfile.findUnique({
        where: { projectId: run.projectId },
      });

      if (!targetProfile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target profile not found',
        });
      }

      // 获取测试用例
      const workspaceRoot = process.env.WORKSPACE_DIR || '.ai-test-workspace';
      const outputsDir = `${workspaceRoot}/${input.runId}/outputs`;
      const testCasesDir = `${outputsDir}/test-cases`;
      const testCasesPath = `${outputsDir}/test-cases.json`;

      const fs = await import('fs/promises');
      const path = await import('path');

      let testCases: any[] = [];

      // 尝试读取测试用例
      try {
        const content = await fs.readFile(testCasesPath, 'utf-8');
        const parsed = JSON.parse(content);
        testCases = Array.isArray(parsed) ? parsed : (parsed.test_cases || parsed.testCases || []);
      } catch {
        try {
          const files = await fs.readdir(testCasesDir);
          const reqFiles = files.filter((f: string) => f.startsWith('REQ-') && f.endsWith('.json'));
          
          for (const reqFile of reqFiles) {
            try {
              const filePath = path.join(testCasesDir, reqFile);
              const content = await fs.readFile(filePath, 'utf-8');
              const parsed = JSON.parse(content);
              
              if (Array.isArray(parsed)) {
                testCases.push(...parsed);
              } else if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
                testCases.push(...parsed.test_cases);
              } else if (parsed.testCases && Array.isArray(parsed.testCases)) {
                testCases.push(...parsed.testCases);
              }
            } catch (e) {
              console.warn(`[generateScript] 无法解析测试用例文件 ${reqFile}:`, e);
            }
          }
        } catch {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Test cases file not found',
          });
        }
      }

      // 按 caseIds 筛选
      if (input.caseIds && input.caseIds.length > 0) {
        testCases = testCases.filter((tc: any) => input.caseIds!.includes(tc.case_id));
      }

      if (testCases.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No test cases found',
        });
      }

      // 转换 target profile
      const profile = {
        id: targetProfile.id,
        projectId: targetProfile.projectId,
        baseUrl: targetProfile.baseUrl,
        browser: fromJsonString(targetProfile.browserConfig),
        login: fromJsonString(targetProfile.loginConfig),
        allowedRoutes: fromJsonString(targetProfile.allowedRoutes),
        uiFramework: targetProfile.uiFramework,
        antdQuirks: targetProfile.antdQuirks ? fromJsonString(targetProfile.antdQuirks) : undefined,
      };

      // 动态导入 ScriptGenerator
      const { ScriptGenerator } = await import('@smart-test-agent/core');
      const generator = new ScriptGenerator({
        targetProfile: profile as any,
        runId: input.runId,
      });

      // 生成脚本
      const script = generator.generateExecutableScript(testCases);

      return {
        content: script,
        testCaseCount: testCases.length,
        filename: `test-${input.runId}.js`,
        generatedAt: new Date().toISOString(),
      };
    }),

  /**
   * 下载 Playwright 脚本
   * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.4
   */
  downloadScript: publicProcedure
    .input(z.object({
      runId: z.string().uuid(),
      caseIds: z.array(z.string()).optional(),
      format: z.enum(['single', 'zip']).default('single'),
    }))
    .mutation(async ({ input }) => {
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

      // 获取 target profile
      const targetProfile = await prisma.targetProfile.findUnique({
        where: { projectId: run.projectId },
      });

      if (!targetProfile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target profile not found',
        });
      }

      // 获取测试用例
      const workspaceRoot = process.env.WORKSPACE_DIR || '.ai-test-workspace';
      const outputsDir = `${workspaceRoot}/${input.runId}/outputs`;
      const testCasesDir = `${outputsDir}/test-cases`;
      const testCasesPath = `${outputsDir}/test-cases.json`;

      const fs = await import('fs/promises');
      const path = await import('path');

      let testCases: any[] = [];

      // 尝试读取测试用例
      try {
        const content = await fs.readFile(testCasesPath, 'utf-8');
        const parsed = JSON.parse(content);
        testCases = Array.isArray(parsed) ? parsed : (parsed.test_cases || parsed.testCases || []);
      } catch {
        try {
          const files = await fs.readdir(testCasesDir);
          const reqFiles = files.filter((f: string) => f.startsWith('REQ-') && f.endsWith('.json'));
          
          for (const reqFile of reqFiles) {
            try {
              const filePath = path.join(testCasesDir, reqFile);
              const content = await fs.readFile(filePath, 'utf-8');
              const parsed = JSON.parse(content);
              
              if (Array.isArray(parsed)) {
                testCases.push(...parsed);
              } else if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
                testCases.push(...parsed.test_cases);
              } else if (parsed.testCases && Array.isArray(parsed.testCases)) {
                testCases.push(...parsed.testCases);
              }
            } catch (e) {
              console.warn(`[downloadScript] 无法解析测试用例文件 ${reqFile}:`, e);
            }
          }
        } catch {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Test cases file not found',
          });
        }
      }

      // 按 caseIds 筛选
      if (input.caseIds && input.caseIds.length > 0) {
        testCases = testCases.filter((tc: any) => input.caseIds!.includes(tc.case_id));
      }

      if (testCases.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No test cases found',
        });
      }

      // 转换 target profile
      const profile = {
        id: targetProfile.id,
        projectId: targetProfile.projectId,
        baseUrl: targetProfile.baseUrl,
        browser: fromJsonString(targetProfile.browserConfig),
        login: fromJsonString(targetProfile.loginConfig),
        allowedRoutes: fromJsonString(targetProfile.allowedRoutes),
        uiFramework: targetProfile.uiFramework,
        antdQuirks: targetProfile.antdQuirks ? fromJsonString(targetProfile.antdQuirks) : undefined,
      };

      // 动态导入 ScriptGenerator
      const { ScriptGenerator } = await import('@smart-test-agent/core');
      const generator = new ScriptGenerator({
        targetProfile: profile as any,
        runId: input.runId,
      });

      const timestamp = new Date().toISOString();

      if (input.format === 'single') {
        // 生成单个完整脚本
        const script = generator.generateExecutableScript(testCases);
        const filename = `test-${input.runId}.js`;
        
        // 添加文件头注释
        const header = `/**
 * Playwright Test Script
 * Run ID: ${input.runId}
 * Generated at: ${timestamp}
 * Test Cases: ${testCases.length}
 * 
 * 使用方法:
 * 1. 确保已安装 Node.js 和 Playwright: npm install playwright
 * 2. 设置环境变量 (如需要): export USERNAME=xxx PASSWORD=xxx
 * 3. 运行脚本: node ${filename}
 */

`;
        
        return {
          format: 'single',
          filename,
          content: header + script,
          mimeType: 'application/javascript',
          generatedAt: timestamp,
        };
      } else {
        // 生成多个脚本并打包为 zip (返回 base64)
        const scripts = generator.generateForTestCases(testCases);
        
        // 使用 archiver 打包 (如果可用)，否则返回脚本列表
        try {
          const archiver = await import('archiver');
          const { Readable } = await import('stream');
          
          // 创建 zip 流
          const archive = archiver.default('zip', { zlib: { level: 9 } });
          const chunks: Buffer[] = [];
          
          archive.on('data', (chunk: Buffer) => chunks.push(chunk));
          
          // 添加每个脚本文件
          for (const script of scripts) {
            const header = `/**
 * Test Case: ${script.caseId} - ${script.title}
 * Generated at: ${timestamp}
 */

`;
            archive.append(header + script.script, { name: script.filename });
          }
          
          // 添加 README
          const readme = `# Playwright Test Scripts

Run ID: ${input.runId}
Generated at: ${timestamp}
Test Cases: ${scripts.length}

## 文件列表

${scripts.map(s => `- ${s.filename}: ${s.title}`).join('\n')}

## 使用方法

1. 确保已安装 Node.js 和 Playwright:
   \`\`\`
   npm install playwright
   \`\`\`

2. 设置环境变量 (如需要):
   \`\`\`
   export USERNAME=your_username
   export PASSWORD=your_password
   \`\`\`

3. 运行单个测试:
   \`\`\`
   node test-tc-001.js
   \`\`\`
`;
          archive.append(readme, { name: 'README.md' });
          
          await archive.finalize();
          
          // 等待所有数据
          await new Promise<void>((resolve) => archive.on('end', resolve));
          
          const zipBuffer = Buffer.concat(chunks);
          const base64Content = zipBuffer.toString('base64');
          
          return {
            format: 'zip',
            filename: `test-scripts-${input.runId}.zip`,
            content: base64Content,
            mimeType: 'application/zip',
            encoding: 'base64',
            generatedAt: timestamp,
            files: scripts.map(s => s.filename),
          };
        } catch {
          // archiver 不可用，返回脚本列表
          return {
            format: 'multiple',
            files: scripts.map(s => ({
              filename: s.filename,
              content: s.script,
              caseId: s.caseId,
              title: s.title,
            })),
            generatedAt: timestamp,
          };
        }
      }
    }),

  /**
   * 获取 Codex 审核结果
   * @see Requirements 8.6, 9.1
   */
  getCodexReviewResults: publicProcedure
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

      // 获取工作目录路径
      const workspaceRoot = process.env.WORKSPACE_DIR || '.ai-test-workspace';
      const reviewResultsPath = `${workspaceRoot}/${input.runId}/outputs/codex-review-results.json`;

      const fs = await import('fs/promises');

      try {
        const content = await fs.readFile(reviewResultsPath, 'utf-8');
        const reviewResults = JSON.parse(content);
        return reviewResults;
      } catch {
        // 如果文件不存在，返回 null（不抛出错误，因为可能还没有审核结果）
        return null;
      }
    }),
});

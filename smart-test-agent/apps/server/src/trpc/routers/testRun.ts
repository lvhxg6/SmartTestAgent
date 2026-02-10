/**
 * Test Run Router
 * Handles test run operations
 * @see Requirements 6.2, 6.3, 6.4, 12.2, 12.3, 12.4, 17.4
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

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
 * Test run output schema
 */
const testRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  state: testRunStateSchema,
  reasonCode: reasonCodeSchema.nullable(),
  prdPath: z.string(),
  testedRoutes: z.array(z.string()),
  workspacePath: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});

export type TestRunState = z.infer<typeof testRunStateSchema>;
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
export type CreateTestRunInput = z.infer<typeof createTestRunInputSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type ConfirmationDecision = z.infer<typeof confirmationDecisionSchema>;
export type TestRun = z.infer<typeof testRunSchema>;

/**
 * Test run router
 * Note: Full implementation will be added in task 17.4
 */
export const testRunRouter = router({
  /**
   * List test runs for a project
   */
  list: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.4
      return [] as TestRun[];
    }),

  /**
   * Get a single test run by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.4
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Test run with id ${input.id} not found`,
      });
    }),

  /**
   * Get test run status
   */
  getStatus: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.4
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Test run with id ${input.id} not found`,
      });
    }),

  /**
   * Create a new test run
   */
  create: publicProcedure
    .input(createTestRunInputSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement with Orchestrator in task 17.4
      const now = new Date();
      const runId = crypto.randomUUID();
      const workspacePath = `.ai-test-workspace/${runId}`;

      const testRun: TestRun = {
        id: runId,
        projectId: input.projectId,
        state: 'created',
        reasonCode: null,
        prdPath: input.prdPath,
        testedRoutes: input.routes,
        workspacePath,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };

      // Emit WebSocket event for new test run
      if (ctx.io) {
        ctx.io.emit('test-run:created', {
          runId,
          state: 'created',
          timestamp: now.toISOString(),
        });
      }

      return testRun;
    }),

  /**
   * Submit approval decision
   * @see Requirements 6.3, 6.4
   */
  submitApproval: publicProcedure
    .input(approvalDecisionSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement with Orchestrator in task 17.4
      const now = new Date();

      // Emit WebSocket event for approval
      if (ctx.io) {
        ctx.io.to(`run:${input.runId}`).emit('test-run:approval', {
          runId: input.runId,
          approved: input.approved,
          timestamp: now.toISOString(),
        });
      }

      return {
        success: true,
        newState: input.approved ? 'executing' : 'generating',
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
      // TODO: Implement with Orchestrator in task 17.4
      const now = new Date();

      // Emit WebSocket event for confirmation
      if (ctx.io) {
        ctx.io.to(`run:${input.runId}`).emit('test-run:confirmation', {
          runId: input.runId,
          confirmed: input.confirmed,
          retest: input.retest,
          timestamp: now.toISOString(),
        });
      }

      let newState: TestRunState;
      if (input.confirmed) {
        newState = 'completed';
      } else if (input.retest) {
        newState = 'created';
      } else {
        newState = 'report_ready';
      }

      return {
        success: true,
        newState,
        timestamp: now.toISOString(),
      };
    }),
});

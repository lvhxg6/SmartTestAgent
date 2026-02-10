/**
 * Report Router
 * Handles test report operations
 * @see Requirements 17.4
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

/**
 * Defect severity enum
 * @see Requirements 10.3
 */
const defectSeveritySchema = z.enum(['critical', 'major', 'minor', 'suggestion']);

/**
 * Defect report schema
 * @see Requirements 10.1, 10.2, 10.3
 */
const defectReportSchema = z.object({
  id: z.string(),
  severity: defectSeveritySchema,
  title: z.string(),
  description: z.string(),
  screenshots: z.array(z.string()),
  operationSteps: z.array(z.string()),
  assertionId: z.string(),
  caseId: z.string(),
  requirementId: z.string(),
  route: z.string(),
});

/**
 * Quality metric schema
 * @see Requirements 11.1, 11.2, 11.5
 */
const qualityMetricSchema = z.object({
  name: z.enum(['RC', 'APR', 'FR']),
  value: z.number(),
  threshold: z.number(),
  passed: z.boolean(),
});

/**
 * Report summary schema
 * @see Requirements 10.5
 */
const reportSummarySchema = z.object({
  totalDefects: z.number(),
  severityDistribution: z.record(defectSeveritySchema, z.number()),
  affectedRoutes: z.array(z.string()),
  qualityMetrics: z.array(qualityMetricSchema),
});

/**
 * Test case summary schema
 */
const testCaseSummarySchema = z.object({
  caseId: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'running', 'passed', 'failed', 'error']),
  assertionCount: z.number(),
  passedCount: z.number(),
  failedCount: z.number(),
});

/**
 * Full report data schema
 * @see Requirements 10.4, 10.5
 */
const reportDataSchema = z.object({
  runId: z.string().uuid(),
  summary: reportSummarySchema,
  defects: z.array(defectReportSchema),
  testCases: z.array(testCaseSummarySchema),
  generatedAt: z.string(),
});

export type DefectSeverity = z.infer<typeof defectSeveritySchema>;
export type DefectReport = z.infer<typeof defectReportSchema>;
export type QualityMetric = z.infer<typeof qualityMetricSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type TestCaseSummary = z.infer<typeof testCaseSummarySchema>;
export type ReportData = z.infer<typeof reportDataSchema>;

/**
 * Report router
 * Note: Full implementation will be added in task 17.5
 */
export const reportRouter = router({
  /**
   * Get report by test run ID
   */
  getByRunId: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.5
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Report for run ${input.runId} not found`,
      });
    }),

  /**
   * Get Markdown report content
   */
  getMarkdown: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with file system in task 17.5
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Markdown report for run ${input.runId} not found`,
      });
    }),

  /**
   * Get defects list for a test run
   */
  getDefects: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.5
      return [] as DefectReport[];
    }),

  /**
   * Get screenshot by path
   */
  getScreenshot: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        screenshotPath: z.string(),
      })
    )
    .query(async ({ input }) => {
      // TODO: Implement with file system in task 17.5
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Screenshot ${input.screenshotPath} not found`,
      });
    }),

  /**
   * Get quality metrics for a test run
   */
  getQualityMetrics: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.5
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Quality metrics for run ${input.runId} not found`,
      });
    }),
});

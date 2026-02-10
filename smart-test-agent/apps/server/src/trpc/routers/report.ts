/**
 * Report Router
 * Handles test report operations with Prisma database and file system integration
 * @see Requirements 17.4
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { prisma, fromJsonString, fromJsonStringNullable } from '@smart-test-agent/db';
import * as fs from 'fs/promises';
import * as path from 'path';

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

export type DefectSeverity = z.infer<typeof defectSeveritySchema>;
export type DefectReport = z.infer<typeof defectReportSchema>;
export type QualityMetric = z.infer<typeof qualityMetricSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type TestCaseSummary = z.infer<typeof testCaseSummarySchema>;

/**
 * Full report data type
 */
export interface ReportData {
  runId: string;
  summary: ReportSummary;
  defects: DefectReport[];
  testCases: TestCaseSummary[];
  generatedAt: string;
}

/**
 * Determine defect severity based on requirement priority and assertion type
 */
function determineSeverity(priority: string, assertionType: string): DefectSeverity {
  if (priority === 'P0') {
    return 'critical';
  }
  if (priority === 'P1') {
    return 'major';
  }
  if (assertionType === 'soft') {
    return 'suggestion';
  }
  return 'minor';
}

/**
 * Report router with Prisma database and file system integration
 */
export const reportRouter = router({
  /**
   * Get report by test run ID
   */
  getByRunId: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Get test run
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
        include: {
          requirements: true,
          testCases: {
            include: {
              assertions: true,
            },
          },
          assertions: true,
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // Build defects list from failed assertions
      const defects: DefectReport[] = [];
      const affectedRoutes = new Set<string>();
      const severityDistribution: Record<DefectSeverity, number> = {
        critical: 0,
        major: 0,
        minor: 0,
        suggestion: 0,
      };

      for (const assertion of run.assertions) {
        if (assertion.finalVerdict === 'fail') {
          // Find related test case and requirement
          const testCase = run.testCases.find(tc => tc.id === assertion.caseId);
          const requirement = run.requirements.find(r => r.id === testCase?.requirementId);

          const severity = determineSeverity(
            requirement?.priority || 'P2',
            assertion.type
          );

          severityDistribution[severity]++;
          affectedRoutes.add(testCase?.route || 'unknown');

          defects.push({
            id: assertion.assertionId,
            severity,
            title: assertion.description,
            description: `Expected: ${assertion.expected}, Actual: ${assertion.actual || 'N/A'}`,
            screenshots: assertion.evidencePath ? [assertion.evidencePath] : [],
            operationSteps: testCase ? fromJsonString<any[]>(testCase.steps).map((s: any) => s.description || s.action) : [],
            assertionId: assertion.assertionId,
            caseId: testCase?.caseId || 'unknown',
            requirementId: requirement?.requirementId || 'unknown',
            route: testCase?.route || 'unknown',
          });
        }
      }

      // Build test case summaries
      const testCaseSummaries: TestCaseSummary[] = run.testCases.map(tc => {
        const tcAssertions = run.assertions.filter(a => a.caseId === tc.id);
        const passedCount = tcAssertions.filter(a => a.finalVerdict === 'pass').length;
        const failedCount = tcAssertions.filter(a => a.finalVerdict === 'fail').length;

        let status: 'pending' | 'running' | 'passed' | 'failed' | 'error' = 'pending';
        if (failedCount > 0) {
          status = 'failed';
        } else if (passedCount === tcAssertions.length && tcAssertions.length > 0) {
          status = 'passed';
        } else if (tcAssertions.some(a => a.machineVerdict === 'error')) {
          status = 'error';
        }

        return {
          caseId: tc.caseId,
          title: tc.title,
          status,
          assertionCount: tcAssertions.length,
          passedCount,
          failedCount,
        };
      });

      // Parse quality metrics
      const qualityMetrics: QualityMetric[] = [];
      if (run.qualityMetrics) {
        const metrics = fromJsonString<any>(run.qualityMetrics);
        if (metrics.rc) {
          qualityMetrics.push({
            name: 'RC',
            value: metrics.rc.value,
            threshold: metrics.rc.threshold || 0.85,
            passed: metrics.rc.passed ?? (metrics.rc.value >= 0.85),
          });
        }
        if (metrics.apr) {
          qualityMetrics.push({
            name: 'APR',
            value: metrics.apr.value,
            threshold: metrics.apr.threshold || 0.95,
            passed: metrics.apr.passed ?? (metrics.apr.value >= 0.95),
          });
        }
        if (metrics.fr) {
          qualityMetrics.push({
            name: 'FR',
            value: metrics.fr.value,
            threshold: metrics.fr.threshold || 0.05,
            passed: metrics.fr.passed ?? (metrics.fr.value <= 0.05),
          });
        }
      }

      const reportData: ReportData = {
        runId: input.runId,
        summary: {
          totalDefects: defects.length,
          severityDistribution,
          affectedRoutes: Array.from(affectedRoutes),
          qualityMetrics,
        },
        defects,
        testCases: testCaseSummaries,
        generatedAt: new Date().toISOString(),
      };

      return reportData;
    }),

  /**
   * Get Markdown report content
   */
  getMarkdown: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Get test run to find report path
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
        select: {
          reportPath: true,
          workspacePath: true,
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // Try to read report file
      const reportPath = run.reportPath || path.join(run.workspacePath, 'report.md');

      try {
        const content = await fs.readFile(reportPath, 'utf-8');
        return {
          content,
          path: reportPath,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Markdown report for run ${input.runId} not found at ${reportPath}`,
        });
      }
    }),

  /**
   * Get defects list for a test run
   */
  getDefects: publicProcedure
    .input(z.object({ 
      runId: z.string().uuid(),
      severity: defectSeveritySchema.optional(),
    }))
    .query(async ({ input }) => {
      // Get test run with assertions
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
        include: {
          requirements: true,
          testCases: true,
          assertions: {
            where: {
              finalVerdict: 'fail',
            },
          },
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // Build defects list
      const defects: DefectReport[] = [];

      for (const assertion of run.assertions) {
        const testCase = run.testCases.find(tc => tc.id === assertion.caseId);
        const requirement = run.requirements.find(r => r.id === testCase?.requirementId);

        const severity = determineSeverity(
          requirement?.priority || 'P2',
          assertion.type
        );

        // Filter by severity if specified
        if (input.severity && severity !== input.severity) {
          continue;
        }

        defects.push({
          id: assertion.assertionId,
          severity,
          title: assertion.description,
          description: `Expected: ${assertion.expected}, Actual: ${assertion.actual || 'N/A'}`,
          screenshots: assertion.evidencePath ? [assertion.evidencePath] : [],
          operationSteps: testCase ? fromJsonString<any[]>(testCase.steps).map((s: any) => s.description || s.action) : [],
          assertionId: assertion.assertionId,
          caseId: testCase?.caseId || 'unknown',
          requirementId: requirement?.requirementId || 'unknown',
          route: testCase?.route || 'unknown',
        });
      }

      return defects;
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
      // Get test run to find workspace path
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
        select: {
          workspacePath: true,
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      // Construct full path (prevent path traversal)
      const normalizedPath = path.normalize(input.screenshotPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(run.workspacePath, 'evidence', 'screenshots', normalizedPath);

      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isFile()) {
          throw new Error('Not a file');
        }

        // Return path for static file serving
        return {
          path: fullPath,
          url: `/workspace/${input.runId}/evidence/screenshots/${normalizedPath}`,
          exists: true,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Screenshot ${input.screenshotPath} not found`,
        });
      }
    }),

  /**
   * Get quality metrics for a test run
   */
  getQualityMetrics: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Get test run
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
        select: {
          qualityMetrics: true,
          state: true,
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      if (!run.qualityMetrics) {
        // Return empty metrics if not yet calculated
        return {
          metrics: [] as QualityMetric[],
          calculated: false,
          state: run.state,
        };
      }

      const metricsData = fromJsonString<any>(run.qualityMetrics);
      const metrics: QualityMetric[] = [];

      if (metricsData.rc) {
        metrics.push({
          name: 'RC',
          value: metricsData.rc.value,
          threshold: metricsData.rc.threshold || 0.85,
          passed: metricsData.rc.passed ?? (metricsData.rc.value >= 0.85),
        });
      }

      if (metricsData.apr) {
        metrics.push({
          name: 'APR',
          value: metricsData.apr.value,
          threshold: metricsData.apr.threshold || 0.95,
          passed: metricsData.apr.passed ?? (metricsData.apr.value >= 0.95),
        });
      }

      if (metricsData.fr) {
        metrics.push({
          name: 'FR',
          value: metricsData.fr.value,
          threshold: metricsData.fr.threshold || 0.05,
          passed: metricsData.fr.passed ?? (metricsData.fr.value <= 0.05),
        });
      }

      return {
        metrics,
        calculated: true,
        state: run.state,
        gateStatus: metrics.every(m => m.passed) ? 'passed' : 'failed',
      };
    }),

  /**
   * List all screenshots for a test run
   */
  listScreenshots: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Get test run
      const run = await prisma.testRun.findUnique({
        where: { id: input.runId },
        select: {
          workspacePath: true,
        },
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Test run with id ${input.runId} not found`,
        });
      }

      const screenshotsDir = path.join(run.workspacePath, 'evidence', 'screenshots');

      try {
        const files = await fs.readdir(screenshotsDir);
        const screenshots = files
          .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
          .map(f => ({
            name: f,
            path: path.join(screenshotsDir, f),
            url: `/workspace/${input.runId}/evidence/screenshots/${f}`,
          }));

        return {
          screenshots,
          total: screenshots.length,
        };
      } catch (error) {
        // Directory doesn't exist yet
        return {
          screenshots: [],
          total: 0,
        };
      }
    }),
});

/**
 * Report Router Tests
 * Unit tests for report API endpoints
 * @see Requirements 17.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { reportRouter } from './report.js';
import { createCallerFactory } from '../trpc.js';

// Mock data storage
const mockRuns = new Map<string, any>();

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(async (filePath: string) => {
    if (filePath.includes('report.md')) {
      return '# Test Report\n\nThis is a test report.';
    }
    throw new Error('File not found');
  }),
  stat: vi.fn(async (filePath: string) => {
    if (filePath.includes('.png') || filePath.includes('.jpg')) {
      return { isFile: () => true };
    }
    throw new Error('File not found');
  }),
  readdir: vi.fn(async (dirPath: string) => {
    if (dirPath.includes('screenshots')) {
      return ['screenshot1.png', 'screenshot2.jpg', 'readme.txt'];
    }
    throw new Error('Directory not found');
  }),
}));

// Mock the Prisma client
vi.mock('@smart-test-agent/db', () => {
  return {
    prisma: {
      testRun: {
        findUnique: vi.fn(async ({ where, select, include }) => {
          const run = mockRuns.get(where.id);
          if (!run) return null;
          
          if (select) {
            const result: any = {};
            for (const key of Object.keys(select)) {
              result[key] = run[key];
            }
            return result;
          }
          
          if (include) {
            return {
              ...run,
              requirements: run.requirements || [],
              testCases: run.testCases || [],
              assertions: run.assertions || [],
            };
          }
          
          return run;
        }),
      },
    },
    fromJsonString: <T>(str: string): T => JSON.parse(str),
    fromJsonStringNullable: <T>(str: string | null): T | null => str ? JSON.parse(str) : null,
  };
});

// Create a caller for testing
const createCaller = createCallerFactory(reportRouter);

// Test run ID
const testRunId = '550e8400-e29b-41d4-a716-446655440000';

describe('Report Router', () => {
  beforeEach(() => {
    mockRuns.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getByRunId', () => {
    it('should return report data when run exists', async () => {
      const now = new Date();
      mockRuns.set(testRunId, {
        id: testRunId,
        projectId: 'project-1',
        state: 'completed',
        workspacePath: `.ai-test-workspace/${testRunId}`,
        qualityMetrics: JSON.stringify({
          rc: { value: 0.9, threshold: 0.85, passed: true },
          apr: { value: 0.98, threshold: 0.95, passed: true },
        }),
        requirements: [
          {
            id: 'req-1',
            requirementId: 'REQ-001',
            title: 'Test Requirement',
            priority: 'P0',
          },
        ],
        testCases: [
          {
            id: 'tc-1',
            caseId: 'TC-001',
            title: 'Test Case 1',
            route: '/dashboard',
            requirementId: 'req-1',
            steps: JSON.stringify([{ action: 'click', description: 'Click button' }]),
          },
        ],
        assertions: [
          {
            id: 'a-1',
            assertionId: 'A-001',
            caseId: 'tc-1',
            type: 'element_visible',
            description: 'Button should be visible',
            expected: 'visible',
            actual: 'hidden',
            finalVerdict: 'fail',
            evidencePath: 'screenshot1.png',
          },
        ],
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({} as any);
      const result = await caller.getByRunId({ runId: testRunId });

      expect(result.runId).toBe(testRunId);
      expect(result.summary.totalDefects).toBe(1);
      expect(result.summary.severityDistribution.critical).toBe(1);
      expect(result.defects).toHaveLength(1);
      expect(result.testCases).toHaveLength(1);
    });

    it('should throw NOT_FOUND when run does not exist', async () => {
      const caller = createCaller({} as any);

      await expect(caller.getByRunId({ runId: testRunId })).rejects.toThrow(TRPCError);
      await expect(caller.getByRunId({ runId: testRunId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should return empty defects when all assertions pass', async () => {
      const now = new Date();
      mockRuns.set(testRunId, {
        id: testRunId,
        projectId: 'project-1',
        state: 'completed',
        workspacePath: `.ai-test-workspace/${testRunId}`,
        qualityMetrics: null,
        requirements: [],
        testCases: [],
        assertions: [],
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({} as any);
      const result = await caller.getByRunId({ runId: testRunId });

      expect(result.summary.totalDefects).toBe(0);
      expect(result.defects).toHaveLength(0);
    });
  });

  describe('getMarkdown', () => {
    it('should return markdown content when report exists', async () => {
      mockRuns.set(testRunId, {
        id: testRunId,
        workspacePath: `.ai-test-workspace/${testRunId}`,
        reportPath: `.ai-test-workspace/${testRunId}/report.md`,
      });

      const caller = createCaller({} as any);
      const result = await caller.getMarkdown({ runId: testRunId });

      expect(result.content).toContain('# Test Report');
      expect(result.path).toContain('report.md');
    });

    it('should throw NOT_FOUND when run does not exist', async () => {
      const caller = createCaller({} as any);

      await expect(caller.getMarkdown({ runId: testRunId })).rejects.toThrow(TRPCError);
      await expect(caller.getMarkdown({ runId: testRunId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getDefects', () => {
    it('should return defects list', async () => {
      const now = new Date();
      mockRuns.set(testRunId, {
        id: testRunId,
        requirements: [
          { id: 'req-1', requirementId: 'REQ-001', priority: 'P1' },
        ],
        testCases: [
          {
            id: 'tc-1',
            caseId: 'TC-001',
            route: '/users',
            requirementId: 'req-1',
            steps: JSON.stringify([]),
          },
        ],
        assertions: [
          {
            id: 'a-1',
            assertionId: 'A-001',
            caseId: 'tc-1',
            type: 'text_content',
            description: 'Text should match',
            expected: 'Hello',
            actual: 'World',
            finalVerdict: 'fail',
          },
        ],
      });

      const caller = createCaller({} as any);
      const result = await caller.getDefects({ runId: testRunId });

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('major'); // P1 = major
    });

    it('should filter by severity', async () => {
      const now = new Date();
      mockRuns.set(testRunId, {
        id: testRunId,
        requirements: [
          { id: 'req-1', requirementId: 'REQ-001', priority: 'P0' },
          { id: 'req-2', requirementId: 'REQ-002', priority: 'P2' },
        ],
        testCases: [
          { id: 'tc-1', caseId: 'TC-001', route: '/a', requirementId: 'req-1', steps: JSON.stringify([]) },
          { id: 'tc-2', caseId: 'TC-002', route: '/b', requirementId: 'req-2', steps: JSON.stringify([]) },
        ],
        assertions: [
          { id: 'a-1', assertionId: 'A-001', caseId: 'tc-1', type: 'element_visible', description: 'D1', expected: 'E1', finalVerdict: 'fail' },
          { id: 'a-2', assertionId: 'A-002', caseId: 'tc-2', type: 'element_visible', description: 'D2', expected: 'E2', finalVerdict: 'fail' },
        ],
      });

      const caller = createCaller({} as any);
      const result = await caller.getDefects({ runId: testRunId, severity: 'critical' });

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
    });
  });

  describe('getScreenshot', () => {
    it('should return screenshot info when file exists', async () => {
      mockRuns.set(testRunId, {
        id: testRunId,
        workspacePath: `.ai-test-workspace/${testRunId}`,
      });

      const caller = createCaller({} as any);
      const result = await caller.getScreenshot({
        runId: testRunId,
        screenshotPath: 'test.png',
      });

      expect(result.exists).toBe(true);
      expect(result.url).toContain('test.png');
    });

    it('should throw NOT_FOUND when run does not exist', async () => {
      const caller = createCaller({} as any);

      await expect(
        caller.getScreenshot({ runId: testRunId, screenshotPath: 'test.png' })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getQualityMetrics', () => {
    it('should return quality metrics when available', async () => {
      mockRuns.set(testRunId, {
        id: testRunId,
        state: 'completed',
        qualityMetrics: JSON.stringify({
          rc: { value: 0.9, threshold: 0.85, passed: true },
          apr: { value: 0.98, threshold: 0.95, passed: true },
          fr: { value: 0.02, threshold: 0.05, passed: true },
        }),
      });

      const caller = createCaller({} as any);
      const result = await caller.getQualityMetrics({ runId: testRunId });

      expect(result.calculated).toBe(true);
      expect(result.metrics).toHaveLength(3);
      expect(result.gateStatus).toBe('passed');
    });

    it('should return empty metrics when not calculated', async () => {
      mockRuns.set(testRunId, {
        id: testRunId,
        state: 'executing',
        qualityMetrics: null,
      });

      const caller = createCaller({} as any);
      const result = await caller.getQualityMetrics({ runId: testRunId });

      expect(result.calculated).toBe(false);
      expect(result.metrics).toHaveLength(0);
    });

    it('should return failed gate status when metrics fail', async () => {
      mockRuns.set(testRunId, {
        id: testRunId,
        state: 'completed',
        qualityMetrics: JSON.stringify({
          rc: { value: 0.7, threshold: 0.85, passed: false },
          apr: { value: 0.98, threshold: 0.95, passed: true },
        }),
      });

      const caller = createCaller({} as any);
      const result = await caller.getQualityMetrics({ runId: testRunId });

      expect(result.gateStatus).toBe('failed');
    });
  });

  describe('listScreenshots', () => {
    it('should return list of screenshots', async () => {
      mockRuns.set(testRunId, {
        id: testRunId,
        workspacePath: `.ai-test-workspace/${testRunId}`,
      });

      const caller = createCaller({} as any);
      const result = await caller.listScreenshots({ runId: testRunId });

      expect(result.screenshots).toHaveLength(2); // Only .png and .jpg files
      expect(result.total).toBe(2);
    });

    it('should throw NOT_FOUND when run does not exist', async () => {
      const caller = createCaller({} as any);

      await expect(caller.listScreenshots({ runId: testRunId })).rejects.toThrow(TRPCError);
    });
  });
});

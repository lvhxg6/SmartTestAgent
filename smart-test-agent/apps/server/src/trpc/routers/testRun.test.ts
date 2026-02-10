/**
 * Test Run Router Tests
 * Unit tests for test run API endpoints
 * @see Requirements 6.2, 6.3, 6.4, 12.2, 12.3, 12.4, 17.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { testRunRouter } from './testRun.js';
import { createCallerFactory } from '../trpc.js';

// Mock data storage
const mockProjects = new Map<string, any>();
const mockProfiles = new Map<string, any>();
const mockRuns = new Map<string, any>();

// Mock the Prisma client
vi.mock('@smart-test-agent/db', () => {
  return {
    prisma: {
      project: {
        findUnique: vi.fn(async ({ where }) => {
          return mockProjects.get(where.id) || null;
        }),
      },
      targetProfile: {
        findUnique: vi.fn(async ({ where }) => {
          return mockProfiles.get(where.projectId) || null;
        }),
      },
      testRun: {
        findMany: vi.fn(async ({ where, skip, take, orderBy }) => {
          let runs = Array.from(mockRuns.values());
          if (where?.projectId) {
            runs = runs.filter(r => r.projectId === where.projectId);
          }
          if (where?.state) {
            runs = runs.filter(r => r.state === where.state);
          }
          // Sort by createdAt desc
          runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return runs.slice(skip || 0, (skip || 0) + (take || 20));
        }),
        findUnique: vi.fn(async ({ where, select }) => {
          const run = mockRuns.get(where.id);
          if (!run) return null;
          if (select) {
            const result: any = {};
            for (const key of Object.keys(select)) {
              result[key] = run[key];
            }
            return result;
          }
          return run;
        }),
        count: vi.fn(async ({ where } = {}) => {
          let runs = Array.from(mockRuns.values());
          if (where?.projectId) {
            runs = runs.filter(r => r.projectId === where.projectId);
          }
          if (where?.state) {
            if (typeof where.state === 'string') {
              runs = runs.filter(r => r.state === where.state);
            } else if (where.state.notIn) {
              runs = runs.filter(r => !where.state.notIn.includes(r.state));
            }
          }
          return runs.length;
        }),
        create: vi.fn(async ({ data }) => {
          const now = new Date();
          const run = {
            ...data,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            reasonCode: null,
            qualityMetrics: null,
            reportPath: null,
          };
          mockRuns.set(data.id, run);
          return run;
        }),
        update: vi.fn(async ({ where, data }) => {
          const run = mockRuns.get(where.id);
          if (!run) return null;
          const updated = { ...run, ...data, updatedAt: new Date() };
          mockRuns.set(where.id, updated);
          return updated;
        }),
      },
    },
    toJsonString: (value: any) => JSON.stringify(value),
    fromJsonString: <T>(str: string): T => JSON.parse(str),
    fromJsonStringNullable: <T>(str: string | null): T | null => str ? JSON.parse(str) : null,
  };
});

// Create a caller for testing
const createCaller = createCallerFactory(testRunRouter);

// Test project ID
const testProjectId = '550e8400-e29b-41d4-a716-446655440000';

describe('Test Run Router', () => {
  beforeEach(() => {
    mockProjects.clear();
    mockProfiles.clear();
    mockRuns.clear();
    vi.clearAllMocks();

    // Add a test project
    const now = new Date();
    mockProjects.set(testProjectId, {
      id: testProjectId,
      name: 'Test Project',
      description: null,
      createdAt: now,
      updatedAt: now,
    });

    // Add a test profile
    mockProfiles.set(testProjectId, {
      id: 'profile-1',
      projectId: testProjectId,
      baseUrl: 'https://example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return empty list when no runs exist', async () => {
      const caller = createCaller({} as any);
      const result = await caller.list({ projectId: testProjectId });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return test runs for project', async () => {
      const now = new Date();
      mockRuns.set('run-1', {
        id: 'run-1',
        projectId: testProjectId,
        state: 'completed',
        prdPath: '/path/to/prd.md',
        testedRoutes: JSON.stringify(['/dashboard']),
        workspacePath: '.ai-test-workspace/run-1',
        envFingerprint: JSON.stringify({}),
        agentVersions: JSON.stringify({}),
        promptVersions: JSON.stringify({}),
        decisionLog: JSON.stringify([]),
        qualityMetrics: null,
        reportPath: null,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        reasonCode: null,
      });

      const caller = createCaller({} as any);
      const result = await caller.list({ projectId: testProjectId });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('run-1');
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      mockProjects.clear();

      const caller = createCaller({} as any);

      await expect(caller.list({ projectId: testProjectId })).rejects.toThrow(TRPCError);
      await expect(caller.list({ projectId: testProjectId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getById', () => {
    it('should return test run when found', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'executing',
        prdPath: '/path/to/prd.md',
        testedRoutes: JSON.stringify(['/dashboard']),
        workspacePath: `.ai-test-workspace/${runId}`,
        envFingerprint: JSON.stringify({}),
        agentVersions: JSON.stringify({}),
        promptVersions: JSON.stringify({}),
        decisionLog: JSON.stringify([]),
        qualityMetrics: null,
        reportPath: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        reasonCode: null,
      });

      const caller = createCaller({} as any);
      const result = await caller.getById({ id: runId });

      expect(result.id).toBe(runId);
      expect(result.state).toBe('executing');
    });

    it('should throw NOT_FOUND when run does not exist', async () => {
      const caller = createCaller({} as any);
      const runId = '550e8400-e29b-41d4-a716-446655440001';

      await expect(caller.getById({ id: runId })).rejects.toThrow(TRPCError);
      await expect(caller.getById({ id: runId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getStatus', () => {
    it('should return status when run exists', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        state: 'executing',
        reasonCode: null,
        updatedAt: now,
        completedAt: null,
      });

      const caller = createCaller({} as any);
      const result = await caller.getStatus({ id: runId });

      expect(result.id).toBe(runId);
      expect(result.state).toBe('executing');
      expect(result.reasonCode).toBeNull();
    });

    it('should throw NOT_FOUND when run does not exist', async () => {
      const caller = createCaller({} as any);
      const runId = '550e8400-e29b-41d4-a716-446655440001';

      await expect(caller.getStatus({ id: runId })).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('should create a new test run', async () => {
      const caller = createCaller({ io: null } as any);
      const result = await caller.create({
        projectId: testProjectId,
        prdPath: '/path/to/prd.md',
        routes: ['/dashboard', '/users'],
      });

      expect(result.id).toBeDefined();
      expect(result.state).toBe('created');
      expect(result.testedRoutes).toEqual(['/dashboard', '/users']);
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      mockProjects.clear();

      const caller = createCaller({ io: null } as any);

      await expect(
        caller.create({
          projectId: testProjectId,
          prdPath: '/path/to/prd.md',
          routes: ['/dashboard'],
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.create({
          projectId: testProjectId,
          prdPath: '/path/to/prd.md',
          routes: ['/dashboard'],
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should throw PRECONDITION_FAILED when target profile does not exist', async () => {
      mockProfiles.clear();

      const caller = createCaller({ io: null } as any);

      await expect(
        caller.create({
          projectId: testProjectId,
          prdPath: '/path/to/prd.md',
          routes: ['/dashboard'],
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.create({
          projectId: testProjectId,
          prdPath: '/path/to/prd.md',
          routes: ['/dashboard'],
        })
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });
  });

  describe('submitApproval', () => {
    it('should approve test run and transition to executing', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'awaiting_approval',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);
      const result = await caller.submitApproval({
        runId,
        approved: true,
        reviewerId: 'reviewer-1',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe('executing');
    });

    it('should reject test run and transition to generating', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'awaiting_approval',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);
      const result = await caller.submitApproval({
        runId,
        approved: false,
        reviewerId: 'reviewer-1',
        comments: 'Need more test cases',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe('generating');
    });

    it('should throw PRECONDITION_FAILED when not in awaiting_approval state', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'executing',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);

      await expect(
        caller.submitApproval({
          runId,
          approved: true,
          reviewerId: 'reviewer-1',
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.submitApproval({
          runId,
          approved: true,
          reviewerId: 'reviewer-1',
        })
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });
  });

  describe('submitConfirmation', () => {
    it('should confirm report and transition to completed', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'report_ready',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);
      const result = await caller.submitConfirmation({
        runId,
        confirmed: true,
        retest: false,
        reviewerId: 'reviewer-1',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe('completed');
    });

    it('should request retest and transition to created', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'report_ready',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);
      const result = await caller.submitConfirmation({
        runId,
        confirmed: false,
        retest: true,
        reviewerId: 'reviewer-1',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe('created');
    });

    it('should throw PRECONDITION_FAILED when not in report_ready state', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'executing',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);

      await expect(
        caller.submitConfirmation({
          runId,
          confirmed: true,
          retest: false,
          reviewerId: 'reviewer-1',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('cancel', () => {
    it('should cancel a running test', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'executing',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({ io: null } as any);
      const result = await caller.cancel({ id: runId, reason: 'User cancelled' });

      expect(result.success).toBe(true);
    });

    it('should throw PRECONDITION_FAILED when run is completed', async () => {
      const now = new Date();
      const runId = '550e8400-e29b-41d4-a716-446655440001';
      mockRuns.set(runId, {
        id: runId,
        projectId: testProjectId,
        state: 'completed',
        decisionLog: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });

      const caller = createCaller({ io: null } as any);

      await expect(caller.cancel({ id: runId })).rejects.toThrow(TRPCError);
      await expect(caller.cancel({ id: runId })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
    });
  });

  describe('getStats', () => {
    it('should return statistics for project', async () => {
      const now = new Date();
      mockRuns.set('run-1', { id: 'run-1', projectId: testProjectId, state: 'completed', createdAt: now });
      mockRuns.set('run-2', { id: 'run-2', projectId: testProjectId, state: 'completed', createdAt: now });
      mockRuns.set('run-3', { id: 'run-3', projectId: testProjectId, state: 'failed', createdAt: now });
      mockRuns.set('run-4', { id: 'run-4', projectId: testProjectId, state: 'executing', createdAt: now });

      const caller = createCaller({} as any);
      const result = await caller.getStats({ projectId: testProjectId });

      expect(result.total).toBe(4);
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.inProgress).toBe(1);
      expect(result.successRate).toBe(0.5);
    });
  });
});

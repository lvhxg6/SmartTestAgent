/**
 * Target Profile Router Tests
 * Unit tests for target profile configuration API endpoints
 * @see Requirements 1.1, 1.2, 17.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { targetProfileRouter } from './targetProfile.js';
import { createCallerFactory } from '../trpc.js';

// Mock data storage
const mockProjects = new Map<string, any>();
const mockProfiles = new Map<string, any>();

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
        findUnique: vi.fn(async ({ where, select }) => {
          const profile = mockProfiles.get(where.projectId);
          if (!profile) return null;
          if (select?.id) return { id: profile.id };
          return profile;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const existing = mockProfiles.get(where.projectId);
          const now = new Date();
          if (existing) {
            const updated = { ...existing, ...update, updatedAt: now };
            mockProfiles.set(where.projectId, updated);
            return updated;
          } else {
            const created = {
              id: crypto.randomUUID(),
              ...create,
              createdAt: now,
              updatedAt: now,
            };
            mockProfiles.set(where.projectId, created);
            return created;
          }
        }),
        delete: vi.fn(async ({ where }) => {
          const profile = mockProfiles.get(where.projectId);
          if (profile) {
            mockProfiles.delete(where.projectId);
          }
          return profile;
        }),
      },
    },
    toJsonString: (value: any) => JSON.stringify(value),
    fromJsonString: <T>(str: string): T => JSON.parse(str),
    fromJsonStringNullable: <T>(str: string | null): T | null => str ? JSON.parse(str) : null,
  };
});

// Mock the core module
vi.mock('@smart-test-agent/core', () => ({
  TargetProfileManager: class {},
  validateTargetProfile: vi.fn(() => ({ valid: true, errors: [] })),
}));

// Create a caller for testing
const createCaller = createCallerFactory(targetProfileRouter);

// Valid test profile input
const validProfileInput = {
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  baseUrl: 'https://example.com',
  browser: {
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timeoutMs: 30000,
  },
  login: {
    loginUrl: '/#/login',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: '#submit',
    credentials: { username: 'test', password: 'test123' },
    successIndicator: '.dashboard',
  },
  allowedRoutes: ['/dashboard', '/users'],
  allowedOperations: ['query', 'view_detail'] as ('query' | 'view_detail')[],
  sourceCode: {
    routeFiles: ['data/uploads/test/route-files/routes.ts'],
    pageFiles: ['data/uploads/test/page-files/UserList.tsx', 'data/uploads/test/page-files/Dashboard.tsx'],
  },
  uiFramework: 'antd' as const,
  antdQuirks: {
    buttonTextSpace: true,
    selectType: 'custom' as const,
    modalCloseSelector: '.ant-modal-close',
  },
};

describe('Target Profile Router', () => {
  beforeEach(() => {
    mockProjects.clear();
    mockProfiles.clear();
    vi.clearAllMocks();

    // Add a test project
    const now = new Date();
    mockProjects.set('550e8400-e29b-41d4-a716-446655440000', {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Project',
      description: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getByProjectId', () => {
    it('should return target profile when found', async () => {
      // Add a test profile
      const now = new Date();
      mockProfiles.set('550e8400-e29b-41d4-a716-446655440000', {
        id: 'profile-1',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        baseUrl: 'https://example.com',
        browserConfig: JSON.stringify(validProfileInput.browser),
        loginConfig: JSON.stringify(validProfileInput.login),
        allowedRoutes: JSON.stringify(validProfileInput.allowedRoutes),
        deniedRoutes: JSON.stringify([]),
        allowedOperations: JSON.stringify(validProfileInput.allowedOperations),
        deniedOperations: JSON.stringify([]),
        sourceCodeConfig: JSON.stringify(validProfileInput.sourceCode),
        uiFramework: 'antd',
        antdQuirks: JSON.stringify(validProfileInput.antdQuirks),
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({} as any);
      const result = await caller.getByProjectId({ 
        projectId: '550e8400-e29b-41d4-a716-446655440000' 
      });

      expect(result.id).toBe('profile-1');
      expect(result.baseUrl).toBe('https://example.com');
      expect(result.uiFramework).toBe('antd');
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      mockProjects.clear();

      const caller = createCaller({} as any);

      await expect(
        caller.getByProjectId({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.getByProjectId({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should throw NOT_FOUND when profile does not exist', async () => {
      const caller = createCaller({} as any);

      await expect(
        caller.getByProjectId({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.getByProjectId({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('upsert', () => {
    it('should create a new target profile', async () => {
      const caller = createCaller({} as any);
      const result = await caller.upsert(validProfileInput);

      expect(result.id).toBeDefined();
      expect(result.baseUrl).toBe('https://example.com');
      expect(result.uiFramework).toBe('antd');
      expect(result.createdAt).toBeDefined();
    });

    it('should update existing target profile', async () => {
      // Create initial profile
      const now = new Date();
      mockProfiles.set('550e8400-e29b-41d4-a716-446655440000', {
        id: 'profile-1',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        baseUrl: 'https://old.example.com',
        browserConfig: JSON.stringify(validProfileInput.browser),
        loginConfig: JSON.stringify(validProfileInput.login),
        allowedRoutes: JSON.stringify(['/old']),
        deniedRoutes: JSON.stringify([]),
        allowedOperations: JSON.stringify(['query']),
        deniedOperations: JSON.stringify([]),
        sourceCodeConfig: JSON.stringify(validProfileInput.sourceCode),
        uiFramework: 'antd',
        antdQuirks: null,
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({} as any);
      const result = await caller.upsert(validProfileInput);

      expect(result.baseUrl).toBe('https://example.com');
      expect(result.allowedRoutes).toEqual(['/dashboard', '/users']);
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      mockProjects.clear();

      const caller = createCaller({} as any);

      await expect(caller.upsert(validProfileInput)).rejects.toThrow(TRPCError);
      await expect(caller.upsert(validProfileInput)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('validate', () => {
    it('should return valid for correct configuration', async () => {
      const caller = createCaller({} as any);
      const result = await caller.validate(validProfileInput);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid route format', async () => {
      const caller = createCaller({} as any);
      const result = await caller.validate({
        ...validProfileInput,
        allowedRoutes: ['dashboard', '/users'], // 'dashboard' missing leading /
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Route "dashboard" must start with /');
    });

    it('should warn when antdQuirks is missing for antd framework', async () => {
      const caller = createCaller({} as any);
      const result = await caller.validate({
        ...validProfileInput,
        antdQuirks: undefined,
      });

      expect(result.errors).toContain(
        'antdQuirks configuration is recommended for Ant Design framework'
      );
    });

    it('should validate viewport dimensions', async () => {
      const caller = createCaller({} as any);
      const result = await caller.validate({
        ...validProfileInput,
        browser: {
          ...validProfileInput.browser,
          viewport: { width: 100, height: 100 },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Viewport width must be at least 320px');
      expect(result.errors).toContain('Viewport height must be at least 240px');
    });

    it('should validate timeout value', async () => {
      const caller = createCaller({} as any);
      const result = await caller.validate({
        ...validProfileInput,
        browser: {
          ...validProfileInput.browser,
          timeoutMs: 500,
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Timeout must be at least 1000ms');
    });
  });

  describe('delete', () => {
    it('should delete existing target profile', async () => {
      // Add a test profile
      const now = new Date();
      mockProfiles.set('550e8400-e29b-41d4-a716-446655440000', {
        id: 'profile-1',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
        baseUrl: 'https://example.com',
        browserConfig: JSON.stringify(validProfileInput.browser),
        loginConfig: JSON.stringify(validProfileInput.login),
        allowedRoutes: JSON.stringify(validProfileInput.allowedRoutes),
        deniedRoutes: JSON.stringify([]),
        allowedOperations: JSON.stringify(validProfileInput.allowedOperations),
        deniedOperations: JSON.stringify([]),
        sourceCodeConfig: JSON.stringify(validProfileInput.sourceCode),
        uiFramework: 'antd',
        antdQuirks: null,
        createdAt: now,
        updatedAt: now,
      });

      const caller = createCaller({} as any);
      const result = await caller.delete({ 
        projectId: '550e8400-e29b-41d4-a716-446655440000' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      mockProjects.clear();

      const caller = createCaller({} as any);

      await expect(
        caller.delete({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.delete({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('should throw NOT_FOUND when profile does not exist', async () => {
      const caller = createCaller({} as any);

      await expect(
        caller.delete({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.delete({ projectId: '550e8400-e29b-41d4-a716-446655440000' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('exists', () => {
    it('should return true when profile exists', async () => {
      // Add a test profile
      mockProfiles.set('550e8400-e29b-41d4-a716-446655440000', {
        id: 'profile-1',
        projectId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const caller = createCaller({} as any);
      const result = await caller.exists({ 
        projectId: '550e8400-e29b-41d4-a716-446655440000' 
      });

      expect(result.exists).toBe(true);
    });

    it('should return false when profile does not exist', async () => {
      const caller = createCaller({} as any);
      const result = await caller.exists({ 
        projectId: '550e8400-e29b-41d4-a716-446655440000' 
      });

      expect(result.exists).toBe(false);
    });
  });
});

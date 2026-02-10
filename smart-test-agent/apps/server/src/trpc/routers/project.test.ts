/**
 * Project Router Tests
 * Unit tests for project management API endpoints
 * @see Requirements 17.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { projectRouter } from './project.js';
import { createCallerFactory } from '../trpc.js';

// Mock the Prisma client
vi.mock('@smart-test-agent/db', () => {
  const mockProjects = new Map<string, any>();
  
  return {
    prisma: {
      project: {
        findMany: vi.fn(async ({ where, skip, take, orderBy, select }) => {
          let projects = Array.from(mockProjects.values());
          
          // Apply search filter
          if (where?.name?.contains) {
            const search = where.name.contains.toLowerCase();
            projects = projects.filter(p => p.name.toLowerCase().includes(search));
          }
          
          // Apply sorting
          if (orderBy) {
            const [field, dir] = Object.entries(orderBy)[0] as [string, string];
            projects.sort((a, b) => {
              const aVal = a[field];
              const bVal = b[field];
              if (aVal < bVal) return dir === 'asc' ? -1 : 1;
              if (aVal > bVal) return dir === 'asc' ? 1 : -1;
              return 0;
            });
          }
          
          // Apply pagination
          return projects.slice(skip || 0, (skip || 0) + (take || 20));
        }),
        findUnique: vi.fn(async ({ where }) => {
          return mockProjects.get(where.id) || null;
        }),
        findFirst: vi.fn(async ({ where }) => {
          const projects = Array.from(mockProjects.values());
          return projects.find(p => {
            if (where.name && p.name !== where.name) return false;
            if (where.id?.not && p.id === where.id.not) return false;
            return true;
          }) || null;
        }),
        count: vi.fn(async ({ where } = {}) => {
          let projects = Array.from(mockProjects.values());
          if (where?.name?.contains) {
            const search = where.name.contains.toLowerCase();
            projects = projects.filter(p => p.name.toLowerCase().includes(search));
          }
          return projects.length;
        }),
        create: vi.fn(async ({ data }) => {
          const now = new Date();
          const project = {
            id: crypto.randomUUID(),
            name: data.name,
            description: data.description ?? null,
            createdAt: now,
            updatedAt: now,
          };
          mockProjects.set(project.id, project);
          return project;
        }),
        update: vi.fn(async ({ where, data }) => {
          const project = mockProjects.get(where.id);
          if (!project) return null;
          
          const updated = {
            ...project,
            ...data,
            updatedAt: new Date(),
          };
          mockProjects.set(where.id, updated);
          return updated;
        }),
        delete: vi.fn(async ({ where }) => {
          const project = mockProjects.get(where.id);
          if (project) {
            mockProjects.delete(where.id);
          }
          return project;
        }),
      },
    },
    // Export the mock map for test manipulation
    __mockProjects: mockProjects,
  };
});

// Import the mock after mocking
import { prisma } from '@smart-test-agent/db';

// Get access to the mock projects map
const getMockProjects = async () => {
  return (await import('@smart-test-agent/db') as any).__mockProjects as Map<string, any>;
};

// Create a caller for testing
const createCaller = createCallerFactory(projectRouter);

describe('Project Router', () => {
  let mockProjects: Map<string, any>;

  beforeEach(async () => {
    // Clear mock projects before each test
    const mod = await import('@smart-test-agent/db') as any;
    mockProjects = mod.__mockProjects;
    mockProjects.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should return empty list when no projects exist', async () => {
      const caller = createCaller({} as any);
      const result = await caller.list();

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should return all projects with pagination info', async () => {
      // Add test projects
      const now = new Date();
      mockProjects.set('1', { id: '1', name: 'Project A', description: 'Desc A', createdAt: now, updatedAt: now });
      mockProjects.set('2', { id: '2', name: 'Project B', description: null, createdAt: now, updatedAt: now });

      const caller = createCaller({} as any);
      const result = await caller.list();

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should support pagination', async () => {
      // Add test projects
      const now = new Date();
      for (let i = 1; i <= 5; i++) {
        mockProjects.set(`${i}`, { id: `${i}`, name: `Project ${i}`, description: null, createdAt: now, updatedAt: now });
      }

      const caller = createCaller({} as any);
      const result = await caller.list({ skip: 0, take: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('should support search by name', async () => {
      const now = new Date();
      mockProjects.set('1', { id: '1', name: 'Test Project', description: null, createdAt: now, updatedAt: now });
      mockProjects.set('2', { id: '2', name: 'Another One', description: null, createdAt: now, updatedAt: now });

      const caller = createCaller({} as any);
      const result = await caller.list({ search: 'Test' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Test Project');
    });
  });

  describe('getById', () => {
    it('should return project when found', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { 
        id: testId, 
        name: 'Test Project', 
        description: 'Test Description', 
        createdAt: now, 
        updatedAt: now 
      });

      const caller = createCaller({} as any);
      const result = await caller.getById({ id: testId });

      expect(result.id).toBe(testId);
      expect(result.name).toBe('Test Project');
      expect(result.description).toBe('Test Description');
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({} as any);
      const testId = '550e8400-e29b-41d4-a716-446655440000';

      await expect(caller.getById({ id: testId })).rejects.toThrow(TRPCError);
      await expect(caller.getById({ id: testId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should validate UUID format', async () => {
      const caller = createCaller({} as any);

      await expect(caller.getById({ id: 'invalid-uuid' })).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should create a new project', async () => {
      const caller = createCaller({} as any);
      const result = await caller.create({ 
        name: 'New Project', 
        description: 'New Description' 
      });

      expect(result.name).toBe('New Project');
      expect(result.description).toBe('New Description');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create project without description', async () => {
      const caller = createCaller({} as any);
      const result = await caller.create({ name: 'No Desc Project' });

      expect(result.name).toBe('No Desc Project');
      expect(result.description).toBeNull();
    });

    it('should throw CONFLICT when name already exists', async () => {
      const now = new Date();
      mockProjects.set('1', { id: '1', name: 'Existing Project', description: null, createdAt: now, updatedAt: now });

      const caller = createCaller({} as any);

      await expect(caller.create({ name: 'Existing Project' })).rejects.toThrow(TRPCError);
      await expect(caller.create({ name: 'Existing Project' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('should validate name is required', async () => {
      const caller = createCaller({} as any);

      await expect(caller.create({ name: '' })).rejects.toThrow();
    });

    it('should validate name max length', async () => {
      const caller = createCaller({} as any);
      const longName = 'a'.repeat(101);

      await expect(caller.create({ name: longName })).rejects.toThrow();
    });

    it('should validate description max length', async () => {
      const caller = createCaller({} as any);
      const longDesc = 'a'.repeat(501);

      await expect(caller.create({ name: 'Test', description: longDesc })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update project name', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { 
        id: testId, 
        name: 'Old Name', 
        description: 'Description', 
        createdAt: now, 
        updatedAt: now 
      });

      const caller = createCaller({} as any);
      const result = await caller.update({ 
        id: testId, 
        data: { name: 'New Name' } 
      });

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('Description');
    });

    it('should update project description', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { 
        id: testId, 
        name: 'Project', 
        description: 'Old Description', 
        createdAt: now, 
        updatedAt: now 
      });

      const caller = createCaller({} as any);
      const result = await caller.update({ 
        id: testId, 
        data: { description: 'New Description' } 
      });

      expect(result.name).toBe('Project');
      expect(result.description).toBe('New Description');
    });

    it('should allow setting description to null', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { 
        id: testId, 
        name: 'Project', 
        description: 'Has Description', 
        createdAt: now, 
        updatedAt: now 
      });

      const caller = createCaller({} as any);
      const result = await caller.update({ 
        id: testId, 
        data: { description: null } 
      });

      expect(result.description).toBeNull();
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({} as any);
      const testId = '550e8400-e29b-41d4-a716-446655440000';

      await expect(caller.update({ 
        id: testId, 
        data: { name: 'New Name' } 
      })).rejects.toThrow(TRPCError);
      await expect(caller.update({ 
        id: testId, 
        data: { name: 'New Name' } 
      })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should throw CONFLICT when updating to existing name', async () => {
      const now = new Date();
      const testId1 = '550e8400-e29b-41d4-a716-446655440001';
      const testId2 = '550e8400-e29b-41d4-a716-446655440002';
      mockProjects.set(testId1, { id: testId1, name: 'Project A', description: null, createdAt: now, updatedAt: now });
      mockProjects.set(testId2, { id: testId2, name: 'Project B', description: null, createdAt: now, updatedAt: now });

      const caller = createCaller({} as any);

      await expect(caller.update({ 
        id: testId1, 
        data: { name: 'Project B' } 
      })).rejects.toThrow(TRPCError);
      await expect(caller.update({ 
        id: testId1, 
        data: { name: 'Project B' } 
      })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('should allow updating to same name', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { 
        id: testId, 
        name: 'Same Name', 
        description: null, 
        createdAt: now, 
        updatedAt: now 
      });

      const caller = createCaller({} as any);
      const result = await caller.update({ 
        id: testId, 
        data: { name: 'Same Name' } 
      });

      expect(result.name).toBe('Same Name');
    });
  });

  describe('delete', () => {
    it('should delete existing project', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { 
        id: testId, 
        name: 'To Delete', 
        description: null, 
        createdAt: now, 
        updatedAt: now 
      });

      const caller = createCaller({} as any);
      const result = await caller.delete({ id: testId });

      expect(result.success).toBe(true);
      expect(result.id).toBe(testId);
      expect(mockProjects.has(testId)).toBe(false);
    });

    it('should throw NOT_FOUND when project does not exist', async () => {
      const caller = createCaller({} as any);
      const testId = '550e8400-e29b-41d4-a716-446655440000';

      await expect(caller.delete({ id: testId })).rejects.toThrow(TRPCError);
      await expect(caller.delete({ id: testId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should validate UUID format', async () => {
      const caller = createCaller({} as any);

      await expect(caller.delete({ id: 'invalid-uuid' })).rejects.toThrow();
    });
  });

  describe('checkNameAvailable', () => {
    it('should return available true when name is not taken', async () => {
      const caller = createCaller({} as any);
      const result = await caller.checkNameAvailable({ name: 'New Name' });

      expect(result.available).toBe(true);
    });

    it('should return available false when name is taken', async () => {
      const now = new Date();
      mockProjects.set('1', { id: '1', name: 'Taken Name', description: null, createdAt: now, updatedAt: now });

      const caller = createCaller({} as any);
      const result = await caller.checkNameAvailable({ name: 'Taken Name' });

      expect(result.available).toBe(false);
    });

    it('should exclude specified project ID from check', async () => {
      const now = new Date();
      const testId = '550e8400-e29b-41d4-a716-446655440000';
      mockProjects.set(testId, { id: testId, name: 'My Name', description: null, createdAt: now, updatedAt: now });

      const caller = createCaller({} as any);
      const result = await caller.checkNameAvailable({ 
        name: 'My Name', 
        excludeId: testId 
      });

      expect(result.available).toBe(true);
    });
  });
});

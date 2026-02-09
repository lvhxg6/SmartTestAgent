/**
 * Unit tests for TargetProfileManager
 * Tests CRUD operations and JSON serialization/deserialization
 * 
 * @see Requirements 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, disconnectPrisma } from '@smart-test-agent/db';
import { TargetProfileManager, type CreateTargetProfileInput } from './index.js';
import type { TargetProfile, BrowserConfig, LoginConfig, SourceCodeConfig, AntdQuirksConfig } from '@smart-test-agent/shared';

// Test fixtures
const createTestBrowserConfig = (): BrowserConfig => ({
  ignoreHTTPSErrors: true,
  viewport: { width: 1920, height: 1080 },
  locale: 'zh-CN',
  timeoutMs: 30000,
});

const createTestLoginConfig = (): LoginConfig => ({
  loginUrl: '/login',
  usernameSelector: '#username',
  passwordSelector: '#password',
  submitSelector: '#submit',
  credentials: {
    username: '$TEST_USERNAME',
    password: '$TEST_PASSWORD',
  },
  successIndicator: '.dashboard',
  tenantValue: 'test-tenant',
  tenantAlreadySelected: false,
});

const createTestSourceCodeConfig = (): SourceCodeConfig => ({
  frontendRoot: '/src',
  routerFile: '/src/router/index.ts',
  pageDir: '/src/pages',
  apiDir: '/src/api',
});

const createTestAntdQuirksConfig = (): AntdQuirksConfig => ({
  buttonTextSpace: true,
  selectType: 'custom',
  modalCloseSelector: '.ant-modal-close',
});

const createTestProfileInput = (projectId: string): CreateTargetProfileInput => ({
  projectId,
  baseUrl: 'https://test.example.com',
  browser: createTestBrowserConfig(),
  login: createTestLoginConfig(),
  allowedRoutes: ['/dashboard', '/users', '/settings'],
  deniedRoutes: ['/admin'],
  allowedOperations: ['query', 'view_detail', 'create', 'edit', 'delete'],
  deniedOperations: [],
  sourceCode: createTestSourceCodeConfig(),
  uiFramework: 'antd',
  antdQuirks: createTestAntdQuirksConfig(),
});

describe('TargetProfileManager', () => {
  let manager: TargetProfileManager;
  let testProjectId: string;

  beforeAll(async () => {
    manager = new TargetProfileManager();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await prisma.targetProfile.deleteMany({});
    await prisma.project.deleteMany({});

    // Create a test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        description: 'A test project for unit tests',
      },
    });
    testProjectId = project.id;
  });

  describe('create', () => {
    it('should create a new target profile with all fields', async () => {
      const input = createTestProfileInput(testProjectId);
      const profile = await manager.create(input);

      expect(profile).toBeDefined();
      expect(profile.id).toBeDefined();
      expect(profile.projectId).toBe(testProjectId);
      expect(profile.baseUrl).toBe(input.baseUrl);
      expect(profile.uiFramework).toBe('antd');
    });

    it('should correctly serialize browser config with ignoreHTTPSErrors', async () => {
      const input = createTestProfileInput(testProjectId);
      input.browser.ignoreHTTPSErrors = true;

      const profile = await manager.create(input);

      expect(profile.browser.ignoreHTTPSErrors).toBe(true);
      expect(profile.browser.viewport).toEqual({ width: 1920, height: 1080 });
      expect(profile.browser.locale).toBe('zh-CN');
      expect(profile.browser.timeoutMs).toBe(30000);
    });

    it('should correctly serialize login config with environment variable references', async () => {
      const input = createTestProfileInput(testProjectId);

      const profile = await manager.create(input);

      expect(profile.login.credentials.username).toBe('$TEST_USERNAME');
      expect(profile.login.credentials.password).toBe('$TEST_PASSWORD');
      expect(profile.login.loginUrl).toBe('/login');
      expect(profile.login.successIndicator).toBe('.dashboard');
    });

    it('should correctly serialize antd_quirks config', async () => {
      const input = createTestProfileInput(testProjectId);

      const profile = await manager.create(input);

      expect(profile.antdQuirks).toBeDefined();
      expect(profile.antdQuirks?.buttonTextSpace).toBe(true);
      expect(profile.antdQuirks?.selectType).toBe('custom');
      expect(profile.antdQuirks?.modalCloseSelector).toBe('.ant-modal-close');
    });

    it('should correctly serialize allowed routes and operations', async () => {
      const input = createTestProfileInput(testProjectId);

      const profile = await manager.create(input);

      expect(profile.allowedRoutes).toEqual(['/dashboard', '/users', '/settings']);
      expect(profile.deniedRoutes).toEqual(['/admin']);
      expect(profile.allowedOperations).toContain('create');
      expect(profile.allowedOperations).toContain('edit');
      expect(profile.allowedOperations).toContain('delete');
    });

    it('should throw error if project does not exist', async () => {
      const input = createTestProfileInput('non-existent-project-id');

      await expect(manager.create(input)).rejects.toThrow('Project with id non-existent-project-id not found');
    });

    it('should throw error if profile already exists for project', async () => {
      const input = createTestProfileInput(testProjectId);
      await manager.create(input);

      await expect(manager.create(input)).rejects.toThrow(`Target profile already exists for project ${testProjectId}`);
    });

    it('should create profile without optional antdQuirks', async () => {
      const input = createTestProfileInput(testProjectId);
      delete (input as any).antdQuirks;

      const profile = await manager.create(input);

      expect(profile.antdQuirks).toBeUndefined();
    });

    it('should support different UI frameworks', async () => {
      const input = createTestProfileInput(testProjectId);
      input.uiFramework = 'element-ui';

      const profile = await manager.create(input);

      expect(profile.uiFramework).toBe('element-ui');
    });
  });

  describe('getById', () => {
    it('should retrieve a profile by ID', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      const retrieved = await manager.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.baseUrl).toBe(input.baseUrl);
    });

    it('should return null for non-existent ID', async () => {
      const retrieved = await manager.getById('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('should correctly deserialize all JSON fields', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      const retrieved = await manager.getById(created.id);

      expect(retrieved?.browser).toEqual(input.browser);
      expect(retrieved?.login).toEqual(input.login);
      expect(retrieved?.sourceCode).toEqual(input.sourceCode);
      expect(retrieved?.antdQuirks).toEqual(input.antdQuirks);
    });
  });

  describe('getByProjectId', () => {
    it('should retrieve a profile by project ID', async () => {
      const input = createTestProfileInput(testProjectId);
      await manager.create(input);

      const retrieved = await manager.getByProjectId(testProjectId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.projectId).toBe(testProjectId);
    });

    it('should return null for project without profile', async () => {
      const retrieved = await manager.getByProjectId(testProjectId);

      expect(retrieved).toBeNull();
    });
  });

  describe('update', () => {
    it('should update baseUrl', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      const updated = await manager.update(created.id, {
        baseUrl: 'https://new.example.com',
      });

      expect(updated.baseUrl).toBe('https://new.example.com');
      expect(updated.browser).toEqual(input.browser); // Other fields unchanged
    });

    it('should update browser config', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      const newBrowserConfig: BrowserConfig = {
        ignoreHTTPSErrors: false,
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
        timeoutMs: 60000,
      };

      const updated = await manager.update(created.id, {
        browser: newBrowserConfig,
      });

      expect(updated.browser).toEqual(newBrowserConfig);
    });

    it('should update antdQuirks to null', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      const updated = await manager.update(created.id, {
        antdQuirks: null,
      });

      expect(updated.antdQuirks).toBeUndefined();
    });

    it('should update allowed operations to include write operations', async () => {
      const input = createTestProfileInput(testProjectId);
      input.allowedOperations = ['query', 'view_detail'];
      const created = await manager.create(input);

      const updated = await manager.update(created.id, {
        allowedOperations: ['query', 'view_detail', 'create', 'edit', 'delete'],
      });

      expect(updated.allowedOperations).toContain('create');
      expect(updated.allowedOperations).toContain('edit');
      expect(updated.allowedOperations).toContain('delete');
    });

    it('should throw error for non-existent profile', async () => {
      await expect(manager.update('non-existent-id', { baseUrl: 'https://new.example.com' }))
        .rejects.toThrow('Target profile with id non-existent-id not found');
    });
  });

  describe('delete', () => {
    it('should delete a profile', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      await manager.delete(created.id);

      const retrieved = await manager.getById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent profile', async () => {
      await expect(manager.delete('non-existent-id'))
        .rejects.toThrow('Target profile with id non-existent-id not found');
    });
  });

  describe('toDbFormat / fromDbFormat', () => {
    it('should correctly round-trip a profile through DB format', async () => {
      const input = createTestProfileInput(testProjectId);
      const created = await manager.create(input);

      // Get the profile and convert to DB format
      const profile = await manager.getById(created.id);
      expect(profile).not.toBeNull();

      const dbFormat = manager.toDbFormat(profile!);
      
      // Verify DB format has JSON strings
      expect(typeof dbFormat.browserConfig).toBe('string');
      expect(typeof dbFormat.loginConfig).toBe('string');
      expect(typeof dbFormat.allowedRoutes).toBe('string');
      expect(typeof dbFormat.sourceCodeConfig).toBe('string');

      // Convert back and verify
      const roundTripped = manager.fromDbFormat({
        ...dbFormat,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(roundTripped.baseUrl).toBe(profile!.baseUrl);
      expect(roundTripped.browser).toEqual(profile!.browser);
      expect(roundTripped.login).toEqual(profile!.login);
      expect(roundTripped.allowedRoutes).toEqual(profile!.allowedRoutes);
      expect(roundTripped.antdQuirks).toEqual(profile!.antdQuirks);
    });
  });
});

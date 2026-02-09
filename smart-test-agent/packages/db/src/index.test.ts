/**
 * Database Layer Unit Tests
 * Tests CRUD operations, relationships, and cascade delete behavior
 * 
 * Requirements: 15.4
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// ============================================================================
// JSON Helper Functions (duplicated from index.ts for testing)
// ============================================================================

/**
 * Serialize a value to JSON string for storage in SQLite
 */
function toJsonString<T>(value: T): string {
  return JSON.stringify(value);
}

/**
 * Parse a JSON string from SQLite storage
 */
function fromJsonString<T>(jsonString: string): T {
  return JSON.parse(jsonString) as T;
}

/**
 * Parse a nullable JSON string from SQLite storage
 */
function fromJsonStringNullable<T>(jsonString: string | null): T | null {
  if (jsonString === null) {
    return null;
  }
  return JSON.parse(jsonString) as T;
}

/**
 * Serialize a nullable value to JSON string for storage in SQLite
 */
function toJsonStringNullable<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

// Use a separate test database via environment variable
// The test database URL is set via DATABASE_URL environment variable
// For tests, we use: DATABASE_URL="file:./data/test.db"

// Create a test-specific Prisma client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./data/test.db',
    },
  },
});

describe('Database Layer Unit Tests', () => {
  beforeAll(async () => {
    // Connect to the test database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Disconnect from the test database
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up all data before each test to ensure isolation
    await prisma.assertion.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.requirement.deleteMany();
    await prisma.testRun.deleteMany();
    await prisma.targetProfile.deleteMany();
    await prisma.project.deleteMany();
  });


  // ============================================================================
  // JSON Helper Functions Tests
  // ============================================================================

  describe('JSON Helper Functions', () => {
    it('should serialize and deserialize objects correctly', () => {
      const original = { name: 'test', value: 123, nested: { a: 1, b: 2 } };
      const serialized = toJsonString(original);
      const deserialized = fromJsonString<typeof original>(serialized);
      
      expect(deserialized).toEqual(original);
    });

    it('should serialize and deserialize arrays correctly', () => {
      const original = ['route1', 'route2', 'route3'];
      const serialized = toJsonString(original);
      const deserialized = fromJsonString<string[]>(serialized);
      
      expect(deserialized).toEqual(original);
    });

    it('should handle nullable values correctly', () => {
      expect(toJsonStringNullable(null)).toBeNull();
      expect(toJsonStringNullable(undefined)).toBeNull();
      expect(fromJsonStringNullable<string>(null)).toBeNull();
      
      const value = { test: 'value' };
      const serialized = toJsonStringNullable(value);
      expect(serialized).not.toBeNull();
      expect(fromJsonStringNullable<typeof value>(serialized)).toEqual(value);
    });
  });


  // ============================================================================
  // Project CRUD Tests
  // ============================================================================

  describe('Project CRUD Operations', () => {
    it('should create a project', async () => {
      const project = await prisma.project.create({
        data: {
          name: 'Test Project',
          description: 'A test project for unit testing',
        },
      });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('A test project for unit testing');
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should read a project by id', async () => {
      const created = await prisma.project.create({
        data: { name: 'Read Test Project' },
      });

      const found = await prisma.project.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Read Test Project');
    });

    it('should update a project', async () => {
      const created = await prisma.project.create({
        data: { name: 'Original Name' },
      });

      const updated = await prisma.project.update({
        where: { id: created.id },
        data: { name: 'Updated Name', description: 'New description' },
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New description');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should delete a project', async () => {
      const created = await prisma.project.create({
        data: { name: 'To Be Deleted' },
      });

      await prisma.project.delete({
        where: { id: created.id },
      });

      const found = await prisma.project.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeNull();
    });

    it('should list all projects', async () => {
      await prisma.project.createMany({
        data: [
          { name: 'Project 1' },
          { name: 'Project 2' },
          { name: 'Project 3' },
        ],
      });

      const projects = await prisma.project.findMany();
      expect(projects).toHaveLength(3);
    });
  });


  // ============================================================================
  // TargetProfile CRUD Tests with JSON Field Handling
  // ============================================================================

  describe('TargetProfile CRUD Operations', () => {
    let projectId: string;

    beforeEach(async () => {
      const project = await prisma.project.create({
        data: { name: 'Profile Test Project' },
      });
      projectId = project.id;
    });

    const createSampleTargetProfile = () => ({
      projectId,
      baseUrl: 'https://example.com',
      browserConfig: toJsonString({
        ignoreHTTPSErrors: true,
        viewport: { width: 1920, height: 1080 },
        locale: 'zh-CN',
        timeoutMs: 30000,
      }),
      loginConfig: toJsonString({
        loginUrl: '/login',
        usernameSelector: '#username',
        passwordSelector: '#password',
        submitSelector: '#submit',
        credentials: { username: '$TEST_USER', password: '$TEST_PASS' },
        successIndicator: '.dashboard',
      }),
      allowedRoutes: toJsonString(['/dashboard', '/users', '/settings']),
      deniedRoutes: toJsonString(['/admin']),
      allowedOperations: toJsonString(['query', 'view_detail', 'create', 'edit']),
      deniedOperations: toJsonString(['delete']),
      sourceCodeConfig: toJsonString({
        frontendRoot: './src',
        routerFile: './src/router/index.ts',
        pageDir: './src/pages',
        apiDir: './src/api',
      }),
      uiFramework: 'antd',
      antdQuirks: toJsonString({
        buttonTextSpace: true,
        selectType: 'custom',
        modalCloseSelector: '.ant-modal-close',
      }),
    });

    it('should create a target profile with JSON fields', async () => {
      const profileData = createSampleTargetProfile();
      const profile = await prisma.targetProfile.create({
        data: profileData,
      });

      expect(profile).toBeDefined();
      expect(profile.id).toBeDefined();
      expect(profile.projectId).toBe(projectId);
      expect(profile.baseUrl).toBe('https://example.com');
      expect(profile.uiFramework).toBe('antd');

      // Verify JSON fields can be deserialized
      const browserConfig = fromJsonString<{ ignoreHTTPSErrors: boolean }>(profile.browserConfig);
      expect(browserConfig.ignoreHTTPSErrors).toBe(true);

      const allowedRoutes = fromJsonString<string[]>(profile.allowedRoutes);
      expect(allowedRoutes).toContain('/dashboard');
    });

    it('should read a target profile by projectId', async () => {
      await prisma.targetProfile.create({
        data: createSampleTargetProfile(),
      });

      const found = await prisma.targetProfile.findUnique({
        where: { projectId },
      });

      expect(found).toBeDefined();
      expect(found?.projectId).toBe(projectId);
    });

    it('should update a target profile', async () => {
      const created = await prisma.targetProfile.create({
        data: createSampleTargetProfile(),
      });

      const newBrowserConfig = toJsonString({
        ignoreHTTPSErrors: false,
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
        timeoutMs: 60000,
      });

      const updated = await prisma.targetProfile.update({
        where: { id: created.id },
        data: {
          baseUrl: 'https://updated.example.com',
          browserConfig: newBrowserConfig,
        },
      });

      expect(updated.baseUrl).toBe('https://updated.example.com');
      const browserConfig = fromJsonString<{ ignoreHTTPSErrors: boolean }>(updated.browserConfig);
      expect(browserConfig.ignoreHTTPSErrors).toBe(false);
    });

    it('should delete a target profile', async () => {
      const created = await prisma.targetProfile.create({
        data: createSampleTargetProfile(),
      });

      await prisma.targetProfile.delete({
        where: { id: created.id },
      });

      const found = await prisma.targetProfile.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeNull();
    });

    it('should handle nullable antdQuirks field', async () => {
      const profileData = createSampleTargetProfile();
      profileData.antdQuirks = null;

      const profile = await prisma.targetProfile.create({
        data: profileData,
      });

      expect(profile.antdQuirks).toBeNull();
      expect(fromJsonStringNullable(profile.antdQuirks)).toBeNull();
    });
  });


  // ============================================================================
  // TestRun CRUD Tests
  // ============================================================================

  describe('TestRun CRUD Operations', () => {
    let projectId: string;

    beforeEach(async () => {
      const project = await prisma.project.create({
        data: { name: 'TestRun Test Project' },
      });
      projectId = project.id;
    });

    const createSampleTestRun = () => ({
      projectId,
      state: 'created',
      prdPath: '/docs/prd.md',
      testedRoutes: toJsonString(['/dashboard', '/users']),
      workspacePath: '.ai-test-workspace/run-001',
      envFingerprint: toJsonString({
        service_version: '1.0.0',
        git_commit: 'abc123',
        config_hash: 'hash123',
        browser_version: 'chromium-120',
      }),
      agentVersions: toJsonString({
        claudeCode: '1.0.0',
        codex: '1.0.0',
      }),
      promptVersions: toJsonString({
        prdParse: 'v1',
        uiTestExecute: 'v1',
        reviewResults: 'v1',
      }),
      decisionLog: toJsonString([]),
    });

    it('should create a test run', async () => {
      const testRun = await prisma.testRun.create({
        data: createSampleTestRun(),
      });

      expect(testRun).toBeDefined();
      expect(testRun.id).toBeDefined();
      expect(testRun.projectId).toBe(projectId);
      expect(testRun.state).toBe('created');
      expect(testRun.prdPath).toBe('/docs/prd.md');
    });

    it('should read a test run by id', async () => {
      const created = await prisma.testRun.create({
        data: createSampleTestRun(),
      });

      const found = await prisma.testRun.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should update test run state', async () => {
      const created = await prisma.testRun.create({
        data: createSampleTestRun(),
      });

      const updated = await prisma.testRun.update({
        where: { id: created.id },
        data: {
          state: 'parsing',
          decisionLog: toJsonString([
            { timestamp: new Date().toISOString(), event: 'START_PARSING' },
          ]),
        },
      });

      expect(updated.state).toBe('parsing');
      const decisionLog = fromJsonString<Array<{ event: string }>>(updated.decisionLog);
      expect(decisionLog[0].event).toBe('START_PARSING');
    });

    it('should update test run with quality metrics', async () => {
      const created = await prisma.testRun.create({
        data: createSampleTestRun(),
      });

      const qualityMetrics = toJsonString({
        rc: { name: 'RC', value: 0.9, threshold: 0.85, passed: true },
        apr: { name: 'APR', value: 0.98, threshold: 0.95, passed: true },
      });

      const updated = await prisma.testRun.update({
        where: { id: created.id },
        data: {
          state: 'completed',
          qualityMetrics,
          reportPath: '.ai-test-workspace/run-001/report.md',
          completedAt: new Date(),
        },
      });

      expect(updated.state).toBe('completed');
      expect(updated.qualityMetrics).not.toBeNull();
      expect(updated.reportPath).toBe('.ai-test-workspace/run-001/report.md');
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it('should update test run with failure reason', async () => {
      const created = await prisma.testRun.create({
        data: createSampleTestRun(),
      });

      const updated = await prisma.testRun.update({
        where: { id: created.id },
        data: {
          state: 'failed',
          reasonCode: 'playwright_error',
        },
      });

      expect(updated.state).toBe('failed');
      expect(updated.reasonCode).toBe('playwright_error');
    });

    it('should delete a test run', async () => {
      const created = await prisma.testRun.create({
        data: createSampleTestRun(),
      });

      await prisma.testRun.delete({
        where: { id: created.id },
      });

      const found = await prisma.testRun.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeNull();
    });
  });


  // ============================================================================
  // Requirement CRUD Tests
  // ============================================================================

  describe('Requirement CRUD Operations', () => {
    let testRunId: string;

    beforeEach(async () => {
      const project = await prisma.project.create({
        data: { name: 'Requirement Test Project' },
      });
      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'parsing',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString(['/dashboard']),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });
      testRunId = testRun.id;
    });

    const createSampleRequirement = () => ({
      runId: testRunId,
      requirementId: 'REQ-001',
      title: 'User Login',
      description: 'Users should be able to login with username and password',
      priority: 'P0',
      testable: true,
      route: '/login',
      acceptanceCriteria: toJsonString([
        'User can enter username',
        'User can enter password',
        'User can click login button',
      ]),
      sourceSection: 'Section 1.1',
      tags: toJsonString(['auth', 'login']),
    });

    it('should create a requirement', async () => {
      const requirement = await prisma.requirement.create({
        data: createSampleRequirement(),
      });

      expect(requirement).toBeDefined();
      expect(requirement.id).toBeDefined();
      expect(requirement.requirementId).toBe('REQ-001');
      expect(requirement.priority).toBe('P0');
      expect(requirement.testable).toBe(true);
    });

    it('should read a requirement by id', async () => {
      const created = await prisma.requirement.create({
        data: createSampleRequirement(),
      });

      const found = await prisma.requirement.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found?.requirementId).toBe('REQ-001');
    });

    it('should update a requirement', async () => {
      const created = await prisma.requirement.create({
        data: createSampleRequirement(),
      });

      const updated = await prisma.requirement.update({
        where: { id: created.id },
        data: {
          priority: 'P1',
          testable: false,
        },
      });

      expect(updated.priority).toBe('P1');
      expect(updated.testable).toBe(false);
    });

    it('should delete a requirement', async () => {
      const created = await prisma.requirement.create({
        data: createSampleRequirement(),
      });

      await prisma.requirement.delete({
        where: { id: created.id },
      });

      const found = await prisma.requirement.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeNull();
    });

    it('should find requirements by runId', async () => {
      await prisma.requirement.createMany({
        data: [
          { ...createSampleRequirement(), requirementId: 'REQ-001' },
          { ...createSampleRequirement(), requirementId: 'REQ-002', priority: 'P1' },
          { ...createSampleRequirement(), requirementId: 'REQ-003', priority: 'P2' },
        ],
      });

      const requirements = await prisma.requirement.findMany({
        where: { runId: testRunId },
      });

      expect(requirements).toHaveLength(3);
    });

    it('should filter requirements by priority', async () => {
      await prisma.requirement.createMany({
        data: [
          { ...createSampleRequirement(), requirementId: 'REQ-001', priority: 'P0' },
          { ...createSampleRequirement(), requirementId: 'REQ-002', priority: 'P0' },
          { ...createSampleRequirement(), requirementId: 'REQ-003', priority: 'P1' },
        ],
      });

      const p0Requirements = await prisma.requirement.findMany({
        where: { runId: testRunId, priority: 'P0' },
      });

      expect(p0Requirements).toHaveLength(2);
    });
  });


  // ============================================================================
  // TestCase CRUD Tests
  // ============================================================================

  describe('TestCase CRUD Operations', () => {
    let testRunId: string;
    let requirementId: string;

    beforeEach(async () => {
      const project = await prisma.project.create({
        data: { name: 'TestCase Test Project' },
      });
      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'generating',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString(['/dashboard']),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });
      testRunId = testRun.id;

      const requirement = await prisma.requirement.create({
        data: {
          runId: testRunId,
          requirementId: 'REQ-001',
          title: 'User Login',
          description: 'Login functionality',
          priority: 'P0',
          testable: true,
          route: '/login',
          acceptanceCriteria: toJsonString([]),
          tags: toJsonString([]),
        },
      });
      requirementId = requirement.id;
    });

    const createSampleTestCase = () => ({
      runId: testRunId,
      requirementId,
      caseId: 'TC-001',
      route: '/login',
      title: 'Valid user login',
      precondition: 'User is on login page',
      steps: toJsonString([
        { action: 'fill', selector: '#username', value: 'testuser' },
        { action: 'fill', selector: '#password', value: 'password123' },
        { action: 'click', selector: '#submit' },
      ]),
      dataPreparation: toJsonString([
        { action: 'create', target: 'user', data: { username: 'testuser' } },
      ]),
      dataCleanup: toJsonString([
        { action: 'delete', target: 'user', data: { username: 'testuser' } },
      ]),
    });

    it('should create a test case', async () => {
      const testCase = await prisma.testCase.create({
        data: createSampleTestCase(),
      });

      expect(testCase).toBeDefined();
      expect(testCase.id).toBeDefined();
      expect(testCase.caseId).toBe('TC-001');
      expect(testCase.title).toBe('Valid user login');
    });

    it('should read a test case by id', async () => {
      const created = await prisma.testCase.create({
        data: createSampleTestCase(),
      });

      const found = await prisma.testCase.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found?.caseId).toBe('TC-001');
    });

    it('should update a test case status', async () => {
      const created = await prisma.testCase.create({
        data: createSampleTestCase(),
      });

      const updated = await prisma.testCase.update({
        where: { id: created.id },
        data: { status: 'passed' },
      });

      expect(updated.status).toBe('passed');
    });

    it('should delete a test case', async () => {
      const created = await prisma.testCase.create({
        data: createSampleTestCase(),
      });

      await prisma.testCase.delete({
        where: { id: created.id },
      });

      const found = await prisma.testCase.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeNull();
    });

    it('should deserialize steps JSON correctly', async () => {
      const testCase = await prisma.testCase.create({
        data: createSampleTestCase(),
      });

      const steps = fromJsonString<Array<{ action: string; selector: string }>>(testCase.steps);
      expect(steps).toHaveLength(3);
      expect(steps[0].action).toBe('fill');
      expect(steps[0].selector).toBe('#username');
    });

    it('should handle nullable dataPreparation and dataCleanup', async () => {
      const testCaseData = createSampleTestCase();
      testCaseData.dataPreparation = null;
      testCaseData.dataCleanup = null;

      const testCase = await prisma.testCase.create({
        data: testCaseData,
      });

      expect(testCase.dataPreparation).toBeNull();
      expect(testCase.dataCleanup).toBeNull();
    });
  });


  // ============================================================================
  // Assertion CRUD Tests
  // ============================================================================

  describe('Assertion CRUD Operations', () => {
    let testRunId: string;
    let testCaseId: string;

    beforeEach(async () => {
      const project = await prisma.project.create({
        data: { name: 'Assertion Test Project' },
      });
      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'executing',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString(['/dashboard']),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });
      testRunId = testRun.id;

      const requirement = await prisma.requirement.create({
        data: {
          runId: testRunId,
          requirementId: 'REQ-001',
          title: 'User Login',
          description: 'Login functionality',
          priority: 'P0',
          testable: true,
          route: '/login',
          acceptanceCriteria: toJsonString([]),
          tags: toJsonString([]),
        },
      });

      const testCase = await prisma.testCase.create({
        data: {
          runId: testRunId,
          requirementId: requirement.id,
          caseId: 'TC-001',
          route: '/login',
          title: 'Valid user login',
          precondition: 'User is on login page',
          steps: toJsonString([]),
        },
      });
      testCaseId = testCase.id;
    });

    const createSampleAssertion = () => ({
      runId: testRunId,
      caseId: testCaseId,
      assertionId: 'A-001',
      type: 'element_visible',
      description: 'Dashboard should be visible after login',
      expected: 'Dashboard element is visible',
    });

    it('should create an assertion', async () => {
      const assertion = await prisma.assertion.create({
        data: createSampleAssertion(),
      });

      expect(assertion).toBeDefined();
      expect(assertion.id).toBeDefined();
      expect(assertion.assertionId).toBe('A-001');
      expect(assertion.type).toBe('element_visible');
    });

    it('should read an assertion by id', async () => {
      const created = await prisma.assertion.create({
        data: createSampleAssertion(),
      });

      const found = await prisma.assertion.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found?.assertionId).toBe('A-001');
    });

    it('should update assertion with machine verdict', async () => {
      const created = await prisma.assertion.create({
        data: createSampleAssertion(),
      });

      const updated = await prisma.assertion.update({
        where: { id: created.id },
        data: {
          actual: 'Dashboard element is visible',
          machineVerdict: 'pass',
          evidencePath: 'evidence/screenshots/step-1.png',
        },
      });

      expect(updated.actual).toBe('Dashboard element is visible');
      expect(updated.machineVerdict).toBe('pass');
      expect(updated.evidencePath).toBe('evidence/screenshots/step-1.png');
    });

    it('should update assertion with soft verdict', async () => {
      const created = await prisma.assertion.create({
        data: {
          ...createSampleAssertion(),
          type: 'soft',
        },
      });

      const updated = await prisma.assertion.update({
        where: { id: created.id },
        data: {
          agentVerdict: 'pass',
          agentReasoning: 'The UI appears correct based on screenshot analysis',
        },
      });

      expect(updated.agentVerdict).toBe('pass');
      expect(updated.agentReasoning).toContain('screenshot analysis');
    });

    it('should update assertion with review verdict', async () => {
      const created = await prisma.assertion.create({
        data: {
          ...createSampleAssertion(),
          machineVerdict: 'pass',
        },
      });

      const updated = await prisma.assertion.update({
        where: { id: created.id },
        data: {
          reviewVerdict: 'agree',
          finalVerdict: 'pass',
        },
      });

      expect(updated.reviewVerdict).toBe('agree');
      expect(updated.finalVerdict).toBe('pass');
    });

    it('should update assertion with conflict', async () => {
      const created = await prisma.assertion.create({
        data: {
          ...createSampleAssertion(),
          machineVerdict: 'pass',
        },
      });

      const updated = await prisma.assertion.update({
        where: { id: created.id },
        data: {
          reviewVerdict: 'disagree',
          conflictType: 'fact_conflict',
        },
      });

      expect(updated.reviewVerdict).toBe('disagree');
      expect(updated.conflictType).toBe('fact_conflict');
    });

    it('should delete an assertion', async () => {
      const created = await prisma.assertion.create({
        data: createSampleAssertion(),
      });

      await prisma.assertion.delete({
        where: { id: created.id },
      });

      const found = await prisma.assertion.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeNull();
    });

    it('should find assertions by type', async () => {
      await prisma.assertion.createMany({
        data: [
          { ...createSampleAssertion(), assertionId: 'A-001', type: 'element_visible' },
          { ...createSampleAssertion(), assertionId: 'A-002', type: 'text_content' },
          { ...createSampleAssertion(), assertionId: 'A-003', type: 'soft' },
        ],
      });

      const softAssertions = await prisma.assertion.findMany({
        where: { type: 'soft' },
      });

      expect(softAssertions).toHaveLength(1);
      expect(softAssertions[0].assertionId).toBe('A-003');
    });
  });


  // ============================================================================
  // Relationship Tests
  // ============================================================================

  describe('Relationship Tests', () => {
    describe('Project → TargetProfile Relationship', () => {
      it('should create project with target profile', async () => {
        const project = await prisma.project.create({
          data: {
            name: 'Project with Profile',
            targetProfile: {
              create: {
                baseUrl: 'https://example.com',
                browserConfig: toJsonString({ ignoreHTTPSErrors: true }),
                loginConfig: toJsonString({ loginUrl: '/login' }),
                allowedRoutes: toJsonString(['/dashboard']),
                deniedRoutes: toJsonString([]),
                allowedOperations: toJsonString(['query']),
                deniedOperations: toJsonString([]),
                sourceCodeConfig: toJsonString({ frontendRoot: './src' }),
                uiFramework: 'antd',
              },
            },
          },
          include: { targetProfile: true },
        });

        expect(project.targetProfile).toBeDefined();
        expect(project.targetProfile?.baseUrl).toBe('https://example.com');
      });

      it('should fetch project with target profile', async () => {
        const created = await prisma.project.create({
          data: {
            name: 'Project with Profile',
            targetProfile: {
              create: {
                baseUrl: 'https://example.com',
                browserConfig: toJsonString({}),
                loginConfig: toJsonString({}),
                allowedRoutes: toJsonString([]),
                deniedRoutes: toJsonString([]),
                allowedOperations: toJsonString([]),
                deniedOperations: toJsonString([]),
                sourceCodeConfig: toJsonString({}),
                uiFramework: 'antd',
              },
            },
          },
        });

        const found = await prisma.project.findUnique({
          where: { id: created.id },
          include: { targetProfile: true },
        });

        expect(found?.targetProfile).toBeDefined();
      });
    });

    describe('TestRun → Requirements → TestCases → Assertions Chain', () => {
      it('should create complete test run hierarchy', async () => {
        const project = await prisma.project.create({
          data: { name: 'Hierarchy Test Project' },
        });

        const testRun = await prisma.testRun.create({
          data: {
            projectId: project.id,
            state: 'executing',
            prdPath: '/docs/prd.md',
            testedRoutes: toJsonString(['/dashboard']),
            workspacePath: '.ai-test-workspace/run-001',
            envFingerprint: toJsonString({}),
            agentVersions: toJsonString({}),
            promptVersions: toJsonString({}),
            decisionLog: toJsonString([]),
          },
        });

        const requirement = await prisma.requirement.create({
          data: {
            runId: testRun.id,
            requirementId: 'REQ-001',
            title: 'Dashboard Access',
            description: 'User can access dashboard',
            priority: 'P0',
            testable: true,
            route: '/dashboard',
            acceptanceCriteria: toJsonString([]),
            tags: toJsonString([]),
          },
        });

        const testCase = await prisma.testCase.create({
          data: {
            runId: testRun.id,
            requirementId: requirement.id,
            caseId: 'TC-001',
            route: '/dashboard',
            title: 'Access dashboard',
            precondition: 'User is logged in',
            steps: toJsonString([]),
          },
        });

        const assertion = await prisma.assertion.create({
          data: {
            runId: testRun.id,
            caseId: testCase.id,
            assertionId: 'A-001',
            type: 'element_visible',
            description: 'Dashboard is visible',
            expected: 'Dashboard element visible',
          },
        });

        // Verify the complete chain
        const fullTestRun = await prisma.testRun.findUnique({
          where: { id: testRun.id },
          include: {
            requirements: {
              include: {
                testCases: {
                  include: {
                    assertions: true,
                  },
                },
              },
            },
          },
        });

        expect(fullTestRun?.requirements).toHaveLength(1);
        expect(fullTestRun?.requirements[0].testCases).toHaveLength(1);
        expect(fullTestRun?.requirements[0].testCases[0].assertions).toHaveLength(1);
        expect(fullTestRun?.requirements[0].testCases[0].assertions[0].assertionId).toBe('A-001');
      });

      it('should navigate from assertion to test run', async () => {
        const project = await prisma.project.create({
          data: { name: 'Navigation Test Project' },
        });

        const testRun = await prisma.testRun.create({
          data: {
            projectId: project.id,
            state: 'executing',
            prdPath: '/docs/prd.md',
            testedRoutes: toJsonString([]),
            workspacePath: '.ai-test-workspace/run-001',
            envFingerprint: toJsonString({}),
            agentVersions: toJsonString({}),
            promptVersions: toJsonString({}),
            decisionLog: toJsonString([]),
          },
        });

        const requirement = await prisma.requirement.create({
          data: {
            runId: testRun.id,
            requirementId: 'REQ-001',
            title: 'Test',
            description: 'Test',
            priority: 'P0',
            testable: true,
            route: '/test',
            acceptanceCriteria: toJsonString([]),
            tags: toJsonString([]),
          },
        });

        const testCase = await prisma.testCase.create({
          data: {
            runId: testRun.id,
            requirementId: requirement.id,
            caseId: 'TC-001',
            route: '/test',
            title: 'Test',
            precondition: 'None',
            steps: toJsonString([]),
          },
        });

        const assertion = await prisma.assertion.create({
          data: {
            runId: testRun.id,
            caseId: testCase.id,
            assertionId: 'A-001',
            type: 'element_visible',
            description: 'Test',
            expected: 'Test',
          },
        });

        // Navigate from assertion back to test run
        const foundAssertion = await prisma.assertion.findUnique({
          where: { id: assertion.id },
          include: {
            testCase: {
              include: {
                requirement: {
                  include: {
                    run: true,
                  },
                },
              },
            },
          },
        });

        expect(foundAssertion?.testCase.requirement.run.id).toBe(testRun.id);
      });
    });
  });


  // ============================================================================
  // Cascade Delete Tests
  // ============================================================================

  describe('Cascade Delete Behavior', () => {
    it('should cascade delete TargetProfile when Project is deleted', async () => {
      const project = await prisma.project.create({
        data: {
          name: 'Cascade Test Project',
          targetProfile: {
            create: {
              baseUrl: 'https://example.com',
              browserConfig: toJsonString({}),
              loginConfig: toJsonString({}),
              allowedRoutes: toJsonString([]),
              deniedRoutes: toJsonString([]),
              allowedOperations: toJsonString([]),
              deniedOperations: toJsonString([]),
              sourceCodeConfig: toJsonString({}),
              uiFramework: 'antd',
            },
          },
        },
        include: { targetProfile: true },
      });

      const profileId = project.targetProfile!.id;

      // Delete the project
      await prisma.project.delete({
        where: { id: project.id },
      });

      // Verify target profile is also deleted
      const foundProfile = await prisma.targetProfile.findUnique({
        where: { id: profileId },
      });

      expect(foundProfile).toBeNull();
    });

    it('should cascade delete TestRuns when Project is deleted', async () => {
      const project = await prisma.project.create({
        data: { name: 'Cascade TestRun Project' },
      });

      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'created',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString([]),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });

      // Delete the project
      await prisma.project.delete({
        where: { id: project.id },
      });

      // Verify test run is also deleted
      const foundTestRun = await prisma.testRun.findUnique({
        where: { id: testRun.id },
      });

      expect(foundTestRun).toBeNull();
    });

    it('should cascade delete Requirements when TestRun is deleted', async () => {
      const project = await prisma.project.create({
        data: { name: 'Cascade Requirement Project' },
      });

      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'parsing',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString([]),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });

      const requirement = await prisma.requirement.create({
        data: {
          runId: testRun.id,
          requirementId: 'REQ-001',
          title: 'Test',
          description: 'Test',
          priority: 'P0',
          testable: true,
          route: '/test',
          acceptanceCriteria: toJsonString([]),
          tags: toJsonString([]),
        },
      });

      // Delete the test run
      await prisma.testRun.delete({
        where: { id: testRun.id },
      });

      // Verify requirement is also deleted
      const foundRequirement = await prisma.requirement.findUnique({
        where: { id: requirement.id },
      });

      expect(foundRequirement).toBeNull();
    });

    it('should cascade delete TestCases when Requirement is deleted', async () => {
      const project = await prisma.project.create({
        data: { name: 'Cascade TestCase Project' },
      });

      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'generating',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString([]),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });

      const requirement = await prisma.requirement.create({
        data: {
          runId: testRun.id,
          requirementId: 'REQ-001',
          title: 'Test',
          description: 'Test',
          priority: 'P0',
          testable: true,
          route: '/test',
          acceptanceCriteria: toJsonString([]),
          tags: toJsonString([]),
        },
      });

      const testCase = await prisma.testCase.create({
        data: {
          runId: testRun.id,
          requirementId: requirement.id,
          caseId: 'TC-001',
          route: '/test',
          title: 'Test',
          precondition: 'None',
          steps: toJsonString([]),
        },
      });

      // Delete the requirement
      await prisma.requirement.delete({
        where: { id: requirement.id },
      });

      // Verify test case is also deleted
      const foundTestCase = await prisma.testCase.findUnique({
        where: { id: testCase.id },
      });

      expect(foundTestCase).toBeNull();
    });

    it('should cascade delete Assertions when TestCase is deleted', async () => {
      const project = await prisma.project.create({
        data: { name: 'Cascade Assertion Project' },
      });

      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'executing',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString([]),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });

      const requirement = await prisma.requirement.create({
        data: {
          runId: testRun.id,
          requirementId: 'REQ-001',
          title: 'Test',
          description: 'Test',
          priority: 'P0',
          testable: true,
          route: '/test',
          acceptanceCriteria: toJsonString([]),
          tags: toJsonString([]),
        },
      });

      const testCase = await prisma.testCase.create({
        data: {
          runId: testRun.id,
          requirementId: requirement.id,
          caseId: 'TC-001',
          route: '/test',
          title: 'Test',
          precondition: 'None',
          steps: toJsonString([]),
        },
      });

      const assertion = await prisma.assertion.create({
        data: {
          runId: testRun.id,
          caseId: testCase.id,
          assertionId: 'A-001',
          type: 'element_visible',
          description: 'Test',
          expected: 'Test',
        },
      });

      // Delete the test case
      await prisma.testCase.delete({
        where: { id: testCase.id },
      });

      // Verify assertion is also deleted
      const foundAssertion = await prisma.assertion.findUnique({
        where: { id: assertion.id },
      });

      expect(foundAssertion).toBeNull();
    });

    it('should cascade delete entire hierarchy when Project is deleted', async () => {
      // Create complete hierarchy
      const project = await prisma.project.create({
        data: { name: 'Full Cascade Test Project' },
      });

      const testRun = await prisma.testRun.create({
        data: {
          projectId: project.id,
          state: 'completed',
          prdPath: '/docs/prd.md',
          testedRoutes: toJsonString(['/dashboard']),
          workspacePath: '.ai-test-workspace/run-001',
          envFingerprint: toJsonString({}),
          agentVersions: toJsonString({}),
          promptVersions: toJsonString({}),
          decisionLog: toJsonString([]),
        },
      });

      const requirement = await prisma.requirement.create({
        data: {
          runId: testRun.id,
          requirementId: 'REQ-001',
          title: 'Dashboard',
          description: 'Dashboard access',
          priority: 'P0',
          testable: true,
          route: '/dashboard',
          acceptanceCriteria: toJsonString([]),
          tags: toJsonString([]),
        },
      });

      const testCase = await prisma.testCase.create({
        data: {
          runId: testRun.id,
          requirementId: requirement.id,
          caseId: 'TC-001',
          route: '/dashboard',
          title: 'Access dashboard',
          precondition: 'Logged in',
          steps: toJsonString([]),
        },
      });

      const assertion = await prisma.assertion.create({
        data: {
          runId: testRun.id,
          caseId: testCase.id,
          assertionId: 'A-001',
          type: 'element_visible',
          description: 'Dashboard visible',
          expected: 'Dashboard element',
          machineVerdict: 'pass',
          finalVerdict: 'pass',
        },
      });

      // Store IDs for verification
      const testRunId = testRun.id;
      const requirementId = requirement.id;
      const testCaseId = testCase.id;
      const assertionId = assertion.id;

      // Delete the project
      await prisma.project.delete({
        where: { id: project.id },
      });

      // Verify entire hierarchy is deleted
      expect(await prisma.testRun.findUnique({ where: { id: testRunId } })).toBeNull();
      expect(await prisma.requirement.findUnique({ where: { id: requirementId } })).toBeNull();
      expect(await prisma.testCase.findUnique({ where: { id: testCaseId } })).toBeNull();
      expect(await prisma.assertion.findUnique({ where: { id: assertionId } })).toBeNull();
    });
  });
});

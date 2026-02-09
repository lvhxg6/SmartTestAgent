/**
 * Property-Based Tests for TargetProfileManager
 * Tests the round-trip property: saving and retrieving a profile should preserve all fields
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * @see Design Document - Property 1: Target Profile Configuration Round-Trip
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { prisma, disconnectPrisma } from '@smart-test-agent/db';
import { TargetProfileManager, type CreateTargetProfileInput } from './index.js';
import type {
  BrowserConfig,
  LoginConfig,
  SourceCodeConfig,
  AntdQuirksConfig,
  OperationType,
  UIFramework,
} from '@smart-test-agent/shared';

// ============================================================================
// Arbitrary Generators for Configuration Types
// ============================================================================

/**
 * Generate a valid BrowserConfig
 * @see Requirements 1.4, 1.5
 */
const browserConfigArbitrary: fc.Arbitrary<BrowserConfig> = fc.record({
  ignoreHTTPSErrors: fc.boolean(),
  viewport: fc.record({
    width: fc.integer({ min: 320, max: 3840 }),
    height: fc.integer({ min: 240, max: 2160 }),
  }),
  locale: fc.constantFrom('zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'fr-FR'),
  timeoutMs: fc.integer({ min: 1000, max: 120000 }),
});

/**
 * Generate a valid CSS selector string
 */
const cssSelectorArbitrary: fc.Arbitrary<string> = fc.oneof(
  // ID selector
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)).map(s => `#${s}`),
  // Class selector
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)).map(s => `.${s}`),
  // Element with class
  fc.tuple(
    fc.constantFrom('div', 'span', 'input', 'button', 'form'),
    fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s))
  ).map(([el, cls]) => `${el}.${cls}`),
  // Data attribute selector
  fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)).map(s => `[data-testid="${s}"]`),
);

/**
 * Generate a valid environment variable reference (e.g., $TEST_USERNAME)
 * @see Requirements 1.3
 */
const envVarReferenceArbitrary: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[A-Z][A-Z0-9_]*$/.test(s))
  .map(s => `$${s}`);

/**
 * Generate a valid LoginConfig with environment variable references
 * @see Requirements 1.1, 1.3
 */
const loginConfigArbitrary: fc.Arbitrary<LoginConfig> = fc.record({
  loginUrl: fc.webPath().map(p => p || '/login'),
  usernameSelector: cssSelectorArbitrary,
  passwordSelector: cssSelectorArbitrary,
  submitSelector: cssSelectorArbitrary,
  credentials: fc.record({
    username: envVarReferenceArbitrary,
    password: envVarReferenceArbitrary,
  }),
  successIndicator: cssSelectorArbitrary,
  tenantValue: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { nil: undefined }),
  tenantAlreadySelected: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Generate a valid file path
 */
const filePathArbitrary: fc.Arbitrary<string> = fc
  .array(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
    { minLength: 1, maxLength: 5 }
  )
  .map(parts => '/' + parts.join('/'));

/**
 * Generate a valid SourceCodeConfig
 * @see Requirements 2.1, 2.2, 2.3
 */
const sourceCodeConfigArbitrary: fc.Arbitrary<SourceCodeConfig> = fc.record({
  frontendRoot: filePathArbitrary,
  routerFile: filePathArbitrary.map(p => `${p}/router/index.ts`),
  pageDir: filePathArbitrary.map(p => `${p}/pages`),
  apiDir: filePathArbitrary.map(p => `${p}/api`),
});

/**
 * Generate a valid AntdQuirksConfig
 * @see Requirements 1.6, 1.7
 */
const antdQuirksConfigArbitrary: fc.Arbitrary<AntdQuirksConfig> = fc.record({
  buttonTextSpace: fc.boolean(),
  selectType: fc.constantFrom('custom', 'native') as fc.Arbitrary<'custom' | 'native'>,
  modalCloseSelector: cssSelectorArbitrary,
});

/**
 * Generate a valid route path
 */
const routePathArbitrary: fc.Arbitrary<string> = fc
  .array(
    fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
    { minLength: 1, maxLength: 4 }
  )
  .map(parts => '/' + parts.join('/'));

/**
 * Generate a valid array of route paths
 */
const routeArrayArbitrary: fc.Arbitrary<string[]> = fc
  .array(routePathArbitrary, { minLength: 1, maxLength: 10 })
  .map(routes => [...new Set(routes)]); // Ensure unique routes

/**
 * Generate a valid OperationType array
 * @see Requirements 1.9
 */
const operationTypeArbitrary: fc.Arbitrary<OperationType> = fc.constantFrom(
  'query',
  'view_detail',
  'search',
  'filter',
  'paginate',
  'create',
  'edit',
  'delete'
);

const operationArrayArbitrary: fc.Arbitrary<OperationType[]> = fc
  .array(operationTypeArbitrary, { minLength: 1, maxLength: 8 })
  .map(ops => [...new Set(ops)] as OperationType[]); // Ensure unique operations

/**
 * Generate a valid UIFramework
 * @see Requirements 1.8
 */
const uiFrameworkArbitrary: fc.Arbitrary<UIFramework> = fc.constantFrom('antd', 'element-ui', 'custom');

/**
 * Generate a valid base URL
 */
const baseUrlArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.webUrl({ validSchemes: ['https'] }),
  fc.webUrl({ validSchemes: ['http'] })
).map(url => {
  // Ensure URL doesn't have trailing slash and is valid
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'https://example.com';
  }
});

// ============================================================================
// Helper function to create a fresh project for each property test iteration
// ============================================================================

// Track created project IDs for cleanup
const createdProjectIds: string[] = [];

async function createTestProject(): Promise<string> {
  const project = await prisma.project.create({
    data: {
      name: `Property Test Project ${Date.now()}-${Math.random().toString(36).substring(7)}`,
      description: 'A project for property-based testing',
    },
  });
  createdProjectIds.push(project.id);
  return project.id;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property Tests: Target Profile', () => {
  let manager: TargetProfileManager;

  beforeAll(async () => {
    manager = new TargetProfileManager();
  });

  afterAll(async () => {
    // Clean up only the projects created by this test suite
    if (createdProjectIds.length > 0) {
      await prisma.targetProfile.deleteMany({
        where: { projectId: { in: createdProjectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: createdProjectIds } },
      });
    }
    await disconnectPrisma();
  });

  /**
   * Property 1: Target Profile Configuration Round-Trip
   * 
   * For any valid TargetProfile object, saving it to the database and then
   * retrieving it should produce an equivalent object with all fields preserved.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it('Property 1: should preserve all fields through save/retrieve cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate all the config parts separately, then combine with fresh projectId
        browserConfigArbitrary,
        loginConfigArbitrary,
        routeArrayArbitrary,
        fc.option(routeArrayArbitrary, { nil: undefined }),
        operationArrayArbitrary,
        fc.option(operationArrayArbitrary, { nil: undefined }),
        sourceCodeConfigArbitrary,
        uiFrameworkArbitrary,
        fc.option(antdQuirksConfigArbitrary, { nil: undefined }),
        baseUrlArbitrary,
        async (browser, login, allowedRoutes, deniedRoutes, allowedOperations, deniedOperations, sourceCode, uiFramework, antdQuirks, baseUrl) => {
          // Create a fresh project for this iteration
          const projectId = await createTestProject();

          const input: CreateTargetProfileInput = {
            projectId,
            baseUrl,
            browser,
            login,
            allowedRoutes,
            deniedRoutes,
            allowedOperations,
            deniedOperations,
            sourceCode,
            uiFramework,
            antdQuirks,
          };

          // Create profile
          const created = await manager.create(input);
          expect(created).toBeDefined();
          expect(created.id).toBeDefined();

          // Retrieve profile
          const retrieved = await manager.getById(created.id);
          expect(retrieved).not.toBeNull();

          // Assert all fields are preserved
          // Basic fields
          expect(retrieved!.projectId).toBe(input.projectId);
          expect(retrieved!.baseUrl).toBe(input.baseUrl);
          expect(retrieved!.uiFramework).toBe(input.uiFramework);

          // Browser config (deep equality)
          expect(retrieved!.browser).toEqual(input.browser);
          expect(retrieved!.browser.ignoreHTTPSErrors).toBe(input.browser.ignoreHTTPSErrors);
          expect(retrieved!.browser.viewport).toEqual(input.browser.viewport);
          expect(retrieved!.browser.locale).toBe(input.browser.locale);
          expect(retrieved!.browser.timeoutMs).toBe(input.browser.timeoutMs);

          // Login config (deep equality)
          expect(retrieved!.login).toEqual(input.login);
          expect(retrieved!.login.credentials.username).toBe(input.login.credentials.username);
          expect(retrieved!.login.credentials.password).toBe(input.login.credentials.password);

          // Source code config (deep equality)
          expect(retrieved!.sourceCode).toEqual(input.sourceCode);

          // Routes (array equality)
          expect(retrieved!.allowedRoutes).toEqual(input.allowedRoutes);
          expect(retrieved!.deniedRoutes).toEqual(input.deniedRoutes ?? []);

          // Operations (array equality)
          expect(retrieved!.allowedOperations).toEqual(input.allowedOperations);
          expect(retrieved!.deniedOperations).toEqual(input.deniedOperations ?? []);

          // Antd quirks (optional field)
          if (input.antdQuirks) {
            expect(retrieved!.antdQuirks).toEqual(input.antdQuirks);
          } else {
            expect(retrieved!.antdQuirks).toBeUndefined();
          }

          return true;
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });

  /**
   * Property 1b: Round-trip through getByProjectId
   * 
   * Verifies that retrieving by project ID also preserves all fields.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it('Property 1b: should preserve all fields when retrieved by projectId', async () => {
    await fc.assert(
      fc.asyncProperty(
        browserConfigArbitrary,
        loginConfigArbitrary,
        routeArrayArbitrary,
        operationArrayArbitrary,
        sourceCodeConfigArbitrary,
        uiFrameworkArbitrary,
        baseUrlArbitrary,
        async (browser, login, allowedRoutes, allowedOperations, sourceCode, uiFramework, baseUrl) => {
          // Create a fresh project for this iteration
          const projectId = await createTestProject();

          const input: CreateTargetProfileInput = {
            projectId,
            baseUrl,
            browser,
            login,
            allowedRoutes,
            allowedOperations,
            sourceCode,
            uiFramework,
          };

          // Create profile
          const created = await manager.create(input);

          // Retrieve by project ID
          const retrieved = await manager.getByProjectId(input.projectId);
          expect(retrieved).not.toBeNull();

          // Assert ID matches
          expect(retrieved!.id).toBe(created.id);

          // Assert all fields are preserved (same checks as Property 1)
          expect(retrieved!.baseUrl).toBe(input.baseUrl);
          expect(retrieved!.browser).toEqual(input.browser);
          expect(retrieved!.login).toEqual(input.login);
          expect(retrieved!.sourceCode).toEqual(input.sourceCode);
          expect(retrieved!.allowedRoutes).toEqual(input.allowedRoutes);
          expect(retrieved!.allowedOperations).toEqual(input.allowedOperations);
          expect(retrieved!.uiFramework).toBe(input.uiFramework);

          return true;
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });

  /**
   * Property 1c: Environment variable references are preserved
   * 
   * Specifically tests that credential strings with $ prefix are stored and retrieved correctly.
   * 
   * **Validates: Requirements 1.3**
   */
  it('Property 1c: should preserve environment variable references in credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        envVarReferenceArbitrary,
        envVarReferenceArbitrary,
        async (username, password) => {
          // Create a fresh project for this iteration
          const projectId = await createTestProject();

          const input: CreateTargetProfileInput = {
            projectId,
            baseUrl: 'https://test.example.com',
            browser: {
              ignoreHTTPSErrors: true,
              viewport: { width: 1920, height: 1080 },
              locale: 'zh-CN',
              timeoutMs: 30000,
            },
            login: {
              loginUrl: '/login',
              usernameSelector: '#username',
              passwordSelector: '#password',
              submitSelector: '#submit',
              credentials: {
                username,
                password,
              },
              successIndicator: '.dashboard',
            },
            allowedRoutes: ['/dashboard'],
            allowedOperations: ['query'],
            sourceCode: {
              frontendRoot: '/src',
              routerFile: '/src/router/index.ts',
              pageDir: '/src/pages',
              apiDir: '/src/api',
            },
            uiFramework: 'antd',
          };

          // Create and retrieve
          const created = await manager.create(input);
          const retrieved = await manager.getById(created.id);

          // Verify environment variable references are preserved exactly
          expect(retrieved!.login.credentials.username).toBe(username);
          expect(retrieved!.login.credentials.password).toBe(password);
          expect(retrieved!.login.credentials.username.startsWith('$')).toBe(true);
          expect(retrieved!.login.credentials.password.startsWith('$')).toBe(true);

          return true;
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });
});

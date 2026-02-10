/**
 * Property-Based Tests for Target Profile Router
 * Feature: mvp-config-simplify, Property 2: loginUrl accepts hash route strings
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { loginConfigSchema, sourceCodeConfigSchema } from './targetProfile.js';

describe('Property 2: loginUrl accepts hash route strings', () => {
  // Feature: mvp-config-simplify, Property 2: loginUrl accepts hash route strings
  // **Validates: Requirements 4.1, 4.2**

  /**
   * Base login config with valid required fields.
   * Only loginUrl will be varied by the property test.
   */
  const baseLoginConfig = {
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: '#submit',
    credentials: { username: 'user', password: 'pass' },
    successIndicator: '.dashboard',
  };

  it('should accept any string as loginUrl without throwing a validation error', () => {
    fc.assert(
      fc.property(fc.string(), (loginUrl) => {
        const input = { ...baseLoginConfig, loginUrl };
        const result = loginConfigSchema.safeParse(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should accept hash route strings (e.g. /#/login) as loginUrl', () => {
    // Generate strings that specifically look like hash routes: /#/...
    const hashRouteArb = fc
      .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/'.split('')), { minLength: 1 })
      .map((path) => `/#/${path}`);

    fc.assert(
      fc.property(hashRouteArb, (loginUrl) => {
        const input = { ...baseLoginConfig, loginUrl };
        const result = loginConfigSchema.safeParse(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should accept relative paths as loginUrl', () => {
    // Generate strings that look like relative paths: /...
    const relativePathArb = fc
      .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_/'.split('')), { minLength: 1 })
      .map((path) => `/${path}`);

    fc.assert(
      fc.property(relativePathArb, (loginUrl) => {
        const input = { ...baseLoginConfig, loginUrl };
        const result = loginConfigSchema.safeParse(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should accept unicode and special character strings as loginUrl', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (loginUrl) => {
        const input = { ...baseLoginConfig, loginUrl };
        const result = loginConfigSchema.safeParse(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should accept empty string as loginUrl', () => {
    const input = { ...baseLoginConfig, loginUrl: '' };
    const result = loginConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});


/**
 * Property-Based Tests for Target Profile Router
 * Feature: mvp-config-simplify, Property 3: sourceCodeConfig accepts file path arrays
 *
 * **Validates: Requirements 4.4**
 */
describe('Property 3: sourceCodeConfig accepts file path arrays', () => {
  // Feature: mvp-config-simplify, Property 3: sourceCodeConfig accepts file path arrays
  // **Validates: Requirements 4.4**

  /**
   * Generator for non-empty arrays of file path strings.
   * Generates realistic file paths like "src/routes.ts", "pages/Dashboard.tsx", etc.
   */
  const filePathArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./'
          .split(''),
      ),
      { minLength: 1, maxLength: 100 },
    );

  const nonEmptyFilePathArrayArb = fc.array(filePathArb, { minLength: 1, maxLength: 20 });

  it('should accept any pair of non-empty string arrays as valid sourceCode configuration', () => {
    fc.assert(
      fc.property(
        nonEmptyFilePathArrayArb,
        nonEmptyFilePathArrayArb,
        (routeFiles, pageFiles) => {
          const input = { routeFiles, pageFiles };
          const result = sourceCodeConfigSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept empty arrays as valid sourceCode configuration', () => {
    fc.assert(
      fc.property(
        fc.constant([] as string[]),
        fc.constant([] as string[]),
        (routeFiles, pageFiles) => {
          const input = { routeFiles, pageFiles };
          const result = sourceCodeConfigSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });

  it('should accept arrays with arbitrary string content (unicode, special chars)', () => {
    const arbitraryStringArrayArb = fc.array(fc.string({ minLength: 1 }), {
      minLength: 1,
      maxLength: 20,
    });

    fc.assert(
      fc.property(
        arbitraryStringArrayArb,
        arbitraryStringArrayArb,
        (routeFiles, pageFiles) => {
          const input = { routeFiles, pageFiles };
          const result = sourceCodeConfigSchema.safeParse(input);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject non-array values for routeFiles or pageFiles', () => {
    // routeFiles as a string instead of array should fail
    const result1 = sourceCodeConfigSchema.safeParse({
      routeFiles: 'not-an-array',
      pageFiles: ['valid.ts'],
    });
    expect(result1.success).toBe(false);

    // pageFiles as a number instead of array should fail
    const result2 = sourceCodeConfigSchema.safeParse({
      routeFiles: ['valid.ts'],
      pageFiles: 123,
    });
    expect(result2.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    // Missing pageFiles
    const result1 = sourceCodeConfigSchema.safeParse({
      routeFiles: ['routes.ts'],
    });
    expect(result1.success).toBe(false);

    // Missing routeFiles
    const result2 = sourceCodeConfigSchema.safeParse({
      pageFiles: ['page.tsx'],
    });
    expect(result2.success).toBe(false);

    // Empty object
    const result3 = sourceCodeConfigSchema.safeParse({});
    expect(result3.success).toBe(false);
  });
});


/**
 * Property-Based Tests for Target Profile Router
 * Feature: mvp-config-simplify, Property 6: deniedRoutes invariant — always empty array
 *
 * **Validates: Requirements 6.3**
 */

// Mock data storage for Property 6
const mockProjects = new Map<string, any>();
const mockProfiles = new Map<string, any>();

// Mock the Prisma client
vi.mock('@smart-test-agent/db', () => {
  return {
    prisma: {
      project: {
        findUnique: vi.fn(async ({ where }: any) => {
          return mockProjects.get(where.id) || null;
        }),
      },
      targetProfile: {
        findUnique: vi.fn(async ({ where, select }: any) => {
          const profile = mockProfiles.get(where.projectId);
          if (!profile) return null;
          if (select?.id) return { id: profile.id };
          return profile;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
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
        delete: vi.fn(async ({ where }: any) => {
          const profile = mockProfiles.get(where.projectId);
          if (profile) {
            mockProfiles.delete(where.projectId);
          }
          return profile;
        }),
      },
    },
    toJsonString: (value: any) => JSON.stringify(value),
    fromJsonString: <T,>(str: string): T => JSON.parse(str),
    fromJsonStringNullable: <T,>(str: string | null): T | null => str ? JSON.parse(str) : null,
  };
});

// Mock the core module
vi.mock('@smart-test-agent/core', () => ({
  TargetProfileManager: class {},
  validateTargetProfile: vi.fn(() => ({ valid: true, errors: [] })),
}));

describe('Property 6: deniedRoutes invariant — always empty array', () => {
  // Feature: mvp-config-simplify, Property 6: deniedRoutes invariant — always empty array
  // **Validates: Requirements 6.3**

  const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockProjects.clear();
    mockProfiles.clear();
    vi.clearAllMocks();

    // Add a test project
    const now = new Date();
    mockProjects.set(PROJECT_ID, {
      id: PROJECT_ID,
      name: 'Test Project',
      description: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Generator for valid route strings (must start with /)
   */
  const routeArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split(''),
      ),
      { minLength: 1, maxLength: 30 },
    )
    .map((s) => `/${s}`);

  /**
   * Generator for non-empty arrays of route strings
   */
  const routeArrayArb = fc.array(routeArb, { minLength: 1, maxLength: 5 });

  /**
   * Generator for file path strings
   */
  const filePathArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789-_./'.split(''),
      ),
      { minLength: 1, maxLength: 50 },
    );

  /**
   * Generator for non-empty file path arrays
   */
  const filePathArrayArb = fc.array(filePathArb, { minLength: 1, maxLength: 10 });

  /**
   * Generator for valid base URLs
   */
  const baseUrlArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
      ),
      { minLength: 1, maxLength: 20 },
    )
    .map((s) => `https://${s}.com`);

  /**
   * Generator for valid login config
   */
  const loginConfigArb = fc.record({
    loginUrl: fc.string({ minLength: 0, maxLength: 50 }),
    usernameSelector: fc.constant('#username'),
    passwordSelector: fc.constant('#password'),
    submitSelector: fc.constant('#submit'),
    credentials: fc.record({
      username: fc.string({ minLength: 1, maxLength: 20 }),
      password: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    successIndicator: fc.constant('.dashboard'),
  });

  /**
   * Generator for valid browser config
   */
  const browserConfigArb = fc.record({
    ignoreHTTPSErrors: fc.boolean(),
    viewport: fc.record({
      width: fc.integer({ min: 320, max: 3840 }),
      height: fc.integer({ min: 240, max: 2160 }),
    }),
    locale: fc.constantFrom('en-US', 'zh-CN', 'ja-JP', 'ko-KR'),
    timeoutMs: fc.integer({ min: 1000, max: 120000 }),
  });

  /**
   * Generator for valid target profile input
   */
  const targetProfileInputArb = fc.record({
    projectId: fc.constant(PROJECT_ID),
    baseUrl: baseUrlArb,
    browser: browserConfigArb,
    login: loginConfigArb,
    allowedRoutes: routeArrayArb,
    allowedOperations: fc.subarray(
      ['query', 'view_detail', 'search', 'filter', 'paginate', 'create', 'edit', 'delete'] as const,
      { minLength: 1 },
    ) as fc.Arbitrary<('query' | 'view_detail' | 'search' | 'filter' | 'paginate' | 'create' | 'edit' | 'delete')[]>,
    sourceCode: fc.record({
      routeFiles: filePathArrayArb,
      pageFiles: filePathArrayArb,
    }),
    uiFramework: fc.constantFrom('antd' as const, 'element-ui' as const, 'custom' as const),
  });

  it('should always store deniedRoutes as JSON string "[]" for any valid target profile upsert', async () => {
    const { targetProfileRouter } = await import('./targetProfile.js');
    const { createCallerFactory } = await import('../trpc.js');
    const { prisma } = await import('@smart-test-agent/db');

    const createCaller = createCallerFactory(targetProfileRouter);
    const caller = createCaller({} as any);

    await fc.assert(
      fc.asyncProperty(targetProfileInputArb, async (input) => {
        // Clear profiles for each iteration to avoid state leakage
        mockProfiles.clear();
        vi.mocked(prisma.targetProfile.upsert).mockClear();

        await caller.upsert(input);

        // Verify the upsert was called with deniedRoutes as "[]"
        expect(prisma.targetProfile.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              deniedRoutes: '[]',
            }),
            update: expect.objectContaining({
              deniedRoutes: '[]',
            }),
          }),
        );

        // Also verify the stored profile has deniedRoutes as "[]"
        const storedProfile = mockProfiles.get(PROJECT_ID);
        expect(storedProfile).toBeDefined();
        expect(storedProfile.deniedRoutes).toBe('[]');
      }),
      { numRuns: 100 },
    );
  });

  it('should store deniedRoutes as "[]" even when updating an existing profile', async () => {
    const { targetProfileRouter } = await import('./targetProfile.js');
    const { createCallerFactory } = await import('../trpc.js');
    const { prisma } = await import('@smart-test-agent/db');

    const createCaller = createCallerFactory(targetProfileRouter);
    const caller = createCaller({} as any);

    await fc.assert(
      fc.asyncProperty(targetProfileInputArb, async (input) => {
        // Pre-populate with an existing profile that has non-empty deniedRoutes
        mockProfiles.set(PROJECT_ID, {
          id: crypto.randomUUID(),
          projectId: PROJECT_ID,
          baseUrl: 'https://old.example.com',
          browserConfig: '{}',
          loginConfig: '{}',
          allowedRoutes: '[]',
          deniedRoutes: JSON.stringify(['/admin', '/secret']), // non-empty!
          allowedOperations: '["query"]',
          deniedOperations: '[]',
          sourceCodeConfig: '{}',
          uiFramework: 'antd',
          antdQuirks: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        vi.mocked(prisma.targetProfile.upsert).mockClear();

        await caller.upsert(input);

        // Even when updating, deniedRoutes should be overwritten to "[]"
        expect(prisma.targetProfile.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: expect.objectContaining({
              deniedRoutes: '[]',
            }),
          }),
        );

        // Verify the stored value is "[]"
        const storedProfile = mockProfiles.get(PROJECT_ID);
        expect(storedProfile.deniedRoutes).toBe('[]');
      }),
      { numRuns: 100 },
    );
  });
});


/**
 * Property-Based Tests for Target Profile Router
 * Feature: mvp-config-simplify, Property 5: Target profile JSON serialization round-trip
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 5: Target profile JSON serialization round-trip', () => {
  // Feature: mvp-config-simplify, Property 5: Target profile JSON serialization round-trip
  // **Validates: Requirements 6.1, 6.2**

  const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockProjects.clear();
    mockProfiles.clear();
    vi.clearAllMocks();

    // Add a test project
    const now = new Date();
    mockProjects.set(PROJECT_ID, {
      id: PROJECT_ID,
      name: 'Test Project',
      description: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Generator for valid route strings (must start with /)
   */
  const routeArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split(''),
      ),
      { minLength: 1, maxLength: 30 },
    )
    .map((s) => `/${s}`);

  /**
   * Generator for file path strings
   */
  const filePathArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789-_./'.split(''),
      ),
      { minLength: 1, maxLength: 50 },
    );

  /**
   * Generator for non-empty file path arrays
   */
  const filePathArrayArb = fc.array(filePathArb, { minLength: 1, maxLength: 10 });

  /**
   * Generator for valid base URLs
   */
  const baseUrlArb = fc
    .stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
      ),
      { minLength: 1, maxLength: 20 },
    )
    .map((s) => `https://${s}.com`);

  /**
   * Generator for valid login config
   */
  const loginConfigArb = fc.record({
    loginUrl: fc.string({ minLength: 0, maxLength: 50 }),
    usernameSelector: fc.constant('#username'),
    passwordSelector: fc.constant('#password'),
    submitSelector: fc.constant('#submit'),
    credentials: fc.record({
      username: fc.string({ minLength: 1, maxLength: 20 }),
      password: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    successIndicator: fc.constant('.dashboard'),
  });

  /**
   * Generator for valid browser config
   */
  const browserConfigArb = fc.record({
    ignoreHTTPSErrors: fc.boolean(),
    viewport: fc.record({
      width: fc.integer({ min: 320, max: 3840 }),
      height: fc.integer({ min: 240, max: 2160 }),
    }),
    locale: fc.constantFrom('en-US', 'zh-CN', 'ja-JP', 'ko-KR'),
    timeoutMs: fc.integer({ min: 1000, max: 120000 }),
  });

  /**
   * Generator for valid antdQuirks config
   */
  const antdQuirksArb = fc.record({
    buttonTextSpace: fc.boolean(),
    selectType: fc.constantFrom('custom' as const, 'native' as const),
    modalCloseSelector: fc.constant('.ant-modal-close'),
  });

  /**
   * Generator for valid target profile input (with single-route allowedRoutes and new sourceCode structure)
   */
  const targetProfileInputArb = fc.record({
    projectId: fc.constant(PROJECT_ID),
    baseUrl: baseUrlArb,
    browser: browserConfigArb,
    login: loginConfigArb,
    allowedRoutes: fc.tuple(routeArb).map(([r]) => [r]), // single-route array
    allowedOperations: fc.subarray(
      ['query', 'view_detail', 'search', 'filter', 'paginate', 'create', 'edit', 'delete'] as const,
      { minLength: 1 },
    ) as fc.Arbitrary<('query' | 'view_detail' | 'search' | 'filter' | 'paginate' | 'create' | 'edit' | 'delete')[]>,
    sourceCode: fc.record({
      routeFiles: filePathArrayArb,
      pageFiles: filePathArrayArb,
    }),
    uiFramework: fc.constantFrom('antd' as const, 'element-ui' as const, 'custom' as const),
    antdQuirks: fc.option(antdQuirksArb, { nil: undefined }),
  });

  it('should produce equivalent data after upsert then getByProjectId round-trip', async () => {
    const { targetProfileRouter } = await import('./targetProfile.js');
    const { createCallerFactory } = await import('../trpc.js');

    const createCaller = createCallerFactory(targetProfileRouter);
    const caller = createCaller({} as any);

    await fc.assert(
      fc.asyncProperty(targetProfileInputArb, async (input) => {
        // Clear profiles for each iteration to avoid state leakage
        mockProfiles.clear();
        vi.clearAllMocks();

        // Re-setup the project mock after clearing
        mockProjects.set(PROJECT_ID, {
          id: PROJECT_ID,
          name: 'Test Project',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Step 1: Save via upsert
        await caller.upsert(input);

        // Step 2: Load via getByProjectId
        const loaded = await caller.getByProjectId({ projectId: PROJECT_ID });

        // Step 3: Compare relevant fields (exclude id, createdAt, updatedAt)
        expect(loaded.baseUrl).toBe(input.baseUrl);
        expect(loaded.browser).toEqual(input.browser);
        expect(loaded.login).toEqual(input.login);
        expect(loaded.allowedRoutes).toEqual(input.allowedRoutes);
        expect(loaded.allowedOperations).toEqual(input.allowedOperations);
        expect(loaded.sourceCode).toEqual(input.sourceCode);
        expect(loaded.uiFramework).toBe(input.uiFramework);

        // antdQuirks: compare when provided, verify undefined/null when not
        if (input.antdQuirks) {
          expect(loaded.antdQuirks).toEqual(input.antdQuirks);
        } else {
          expect(loaded.antdQuirks).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve single-route allowedRoutes through round-trip (database compatibility)', async () => {
    const { targetProfileRouter } = await import('./targetProfile.js');
    const { createCallerFactory } = await import('../trpc.js');
    const { prisma } = await import('@smart-test-agent/db');

    const createCaller = createCallerFactory(targetProfileRouter);
    const caller = createCaller({} as any);

    await fc.assert(
      fc.asyncProperty(targetProfileInputArb, async (input) => {
        // Clear profiles for each iteration
        mockProfiles.clear();
        vi.clearAllMocks();

        // Re-setup the project mock after clearing
        mockProjects.set(PROJECT_ID, {
          id: PROJECT_ID,
          name: 'Test Project',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Upsert the profile
        await caller.upsert(input);

        // Verify the stored DB record has JSON-serialized allowedRoutes as array
        const storedProfile = mockProfiles.get(PROJECT_ID);
        expect(storedProfile).toBeDefined();

        // allowedRoutes should be stored as JSON string of array (Requirement 6.1)
        const storedRoutes = JSON.parse(storedProfile.allowedRoutes);
        expect(Array.isArray(storedRoutes)).toBe(true);
        expect(storedRoutes).toEqual(input.allowedRoutes);

        // sourceCodeConfig should be stored as JSON string (Requirement 6.2)
        const storedSourceCode = JSON.parse(storedProfile.sourceCodeConfig);
        expect(storedSourceCode).toEqual(input.sourceCode);

        // Load back and verify round-trip
        const loaded = await caller.getByProjectId({ projectId: PROJECT_ID });
        expect(loaded.allowedRoutes).toEqual(input.allowedRoutes);
        expect(loaded.sourceCode).toEqual(input.sourceCode);
      }),
      { numRuns: 100 },
    );
  });
});

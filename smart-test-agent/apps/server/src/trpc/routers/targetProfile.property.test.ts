/**
 * Property-Based Tests for Target Profile Router
 * Feature: mvp-config-simplify, Property 2: loginUrl accepts hash route strings
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import { describe, it, expect } from 'vitest';
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

/**
 * Property-Based Tests for Target Profile Router
 * Feature: mvp-config-simplify, Property 2: loginUrl accepts hash route strings
 *
 * **Validates: Requirements 4.1, 4.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { loginConfigSchema } from './targetProfile.js';

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

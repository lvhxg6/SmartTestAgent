/**
 * Unit Tests for Environment Variable Resolver
 * 
 * Tests the environment variable resolution functionality for credentials
 * and login configuration.
 * 
 * @see Requirements 1.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isEnvVariable,
  extractEnvVarName,
  resolveEnvVariable,
  resolveCredentials,
  resolveLoginConfig,
} from './env-resolver';
import type { LoginConfig } from '@smart-test-agent/shared';

describe('Environment Variable Resolver', () => {
  // Store original env values to restore after tests
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    originalEnv.TEST_USERNAME = process.env.TEST_USERNAME;
    originalEnv.TEST_PASSWORD = process.env.TEST_PASSWORD;
    originalEnv.CUSTOM_VAR = process.env.CUSTOM_VAR;
    originalEnv.EMPTY_VAR = process.env.EMPTY_VAR;
  });

  afterEach(() => {
    // Restore original values
    if (originalEnv.TEST_USERNAME === undefined) {
      delete process.env.TEST_USERNAME;
    } else {
      process.env.TEST_USERNAME = originalEnv.TEST_USERNAME;
    }
    if (originalEnv.TEST_PASSWORD === undefined) {
      delete process.env.TEST_PASSWORD;
    } else {
      process.env.TEST_PASSWORD = originalEnv.TEST_PASSWORD;
    }
    if (originalEnv.CUSTOM_VAR === undefined) {
      delete process.env.CUSTOM_VAR;
    } else {
      process.env.CUSTOM_VAR = originalEnv.CUSTOM_VAR;
    }
    if (originalEnv.EMPTY_VAR === undefined) {
      delete process.env.EMPTY_VAR;
    } else {
      process.env.EMPTY_VAR = originalEnv.EMPTY_VAR;
    }
  });

  describe('isEnvVariable', () => {
    it('should return true for valid environment variable references', () => {
      expect(isEnvVariable('$TEST_USERNAME')).toBe(true);
      expect(isEnvVariable('$TEST_PASSWORD')).toBe(true);
      expect(isEnvVariable('$MY_VAR')).toBe(true);
      expect(isEnvVariable('$A')).toBe(true);
      expect(isEnvVariable('$VAR123')).toBe(true);
      expect(isEnvVariable('$_UNDERSCORE')).toBe(true);
      expect(isEnvVariable('$VAR_WITH_NUMBERS_123')).toBe(true);
    });

    it('should return false for plain values', () => {
      expect(isEnvVariable('plain_value')).toBe(false);
      expect(isEnvVariable('admin')).toBe(false);
      expect(isEnvVariable('password123')).toBe(false);
      expect(isEnvVariable('https://example.com')).toBe(false);
    });

    it('should return false for invalid environment variable formats', () => {
      // Missing $ prefix
      expect(isEnvVariable('TEST_USERNAME')).toBe(false);
      // Lowercase letters
      expect(isEnvVariable('$test_username')).toBe(false);
      expect(isEnvVariable('$Test_Username')).toBe(false);
      // Invalid characters
      expect(isEnvVariable('$TEST-USERNAME')).toBe(false);
      expect(isEnvVariable('$TEST.USERNAME')).toBe(false);
      expect(isEnvVariable('$TEST USERNAME')).toBe(false);
      // Starting with number
      expect(isEnvVariable('$123VAR')).toBe(false);
      // Multiple $ signs
      expect(isEnvVariable('$$TEST')).toBe(false);
      // $ in the middle
      expect(isEnvVariable('TEST$VAR')).toBe(false);
    });

    it('should return false for empty or invalid inputs', () => {
      expect(isEnvVariable('')).toBe(false);
      expect(isEnvVariable('$')).toBe(false);
    });
  });

  describe('extractEnvVarName', () => {
    it('should extract variable name from valid references', () => {
      expect(extractEnvVarName('$TEST_USERNAME')).toBe('TEST_USERNAME');
      expect(extractEnvVarName('$MY_VAR')).toBe('MY_VAR');
      expect(extractEnvVarName('$A')).toBe('A');
      expect(extractEnvVarName('$VAR123')).toBe('VAR123');
    });

    it('should return null for invalid references', () => {
      expect(extractEnvVarName('plain_value')).toBeNull();
      expect(extractEnvVarName('$test_username')).toBeNull();
      expect(extractEnvVarName('')).toBeNull();
    });
  });

  describe('resolveEnvVariable', () => {
    it('should resolve environment variable references', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      expect(resolveEnvVariable('$TEST_USERNAME')).toBe('admin');
      expect(resolveEnvVariable('$TEST_PASSWORD')).toBe('secret123');
    });

    it('should return plain values as-is', () => {
      expect(resolveEnvVariable('plain_value')).toBe('plain_value');
      expect(resolveEnvVariable('admin')).toBe('admin');
      expect(resolveEnvVariable('https://example.com')).toBe('https://example.com');
      expect(resolveEnvVariable('')).toBe('');
    });

    it('should handle empty string environment variable values', () => {
      process.env.EMPTY_VAR = '';
      expect(resolveEnvVariable('$EMPTY_VAR')).toBe('');
    });

    it('should throw error for undefined environment variables', () => {
      delete process.env.UNDEFINED_VAR;

      expect(() => resolveEnvVariable('$UNDEFINED_VAR')).toThrow(
        'Environment variable UNDEFINED_VAR is not set'
      );
    });

    it('should include helpful message in error', () => {
      delete process.env.MISSING_VAR;

      expect(() => resolveEnvVariable('$MISSING_VAR')).toThrow(
        'Please set the MISSING_VAR environment variable before running tests'
      );
    });
  });

  describe('resolveCredentials', () => {
    it('should resolve both username and password environment variables', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      const credentials = {
        username: '$TEST_USERNAME',
        password: '$TEST_PASSWORD',
      };

      const resolved = resolveCredentials(credentials);

      expect(resolved.username).toBe('admin');
      expect(resolved.password).toBe('secret123');
    });

    it('should return plain values as-is', () => {
      const credentials = {
        username: 'admin',
        password: 'secret123',
      };

      const resolved = resolveCredentials(credentials);

      expect(resolved.username).toBe('admin');
      expect(resolved.password).toBe('secret123');
    });

    it('should handle mixed env vars and plain values', () => {
      process.env.TEST_PASSWORD = 'secret123';

      const credentials = {
        username: 'admin',
        password: '$TEST_PASSWORD',
      };

      const resolved = resolveCredentials(credentials);

      expect(resolved.username).toBe('admin');
      expect(resolved.password).toBe('secret123');
    });

    it('should throw error if username env var is not set', () => {
      delete process.env.MISSING_USER;
      process.env.TEST_PASSWORD = 'secret123';

      const credentials = {
        username: '$MISSING_USER',
        password: '$TEST_PASSWORD',
      };

      expect(() => resolveCredentials(credentials)).toThrow(
        'Environment variable MISSING_USER is not set'
      );
    });

    it('should throw error if password env var is not set', () => {
      process.env.TEST_USERNAME = 'admin';
      delete process.env.MISSING_PASS;

      const credentials = {
        username: '$TEST_USERNAME',
        password: '$MISSING_PASS',
      };

      expect(() => resolveCredentials(credentials)).toThrow(
        'Environment variable MISSING_PASS is not set'
      );
    });

    it('should not mutate the original credentials object', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      const credentials = {
        username: '$TEST_USERNAME',
        password: '$TEST_PASSWORD',
      };

      const resolved = resolveCredentials(credentials);

      expect(credentials.username).toBe('$TEST_USERNAME');
      expect(credentials.password).toBe('$TEST_PASSWORD');
      expect(resolved).not.toBe(credentials);
    });
  });

  describe('resolveLoginConfig', () => {
    const baseLoginConfig: LoginConfig = {
      loginUrl: 'https://example.com/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: '#submit',
      credentials: {
        username: '$TEST_USERNAME',
        password: '$TEST_PASSWORD',
      },
      successIndicator: '.dashboard',
    };

    it('should resolve credentials in login config', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      const resolved = resolveLoginConfig(baseLoginConfig);

      expect(resolved.credentials.username).toBe('admin');
      expect(resolved.credentials.password).toBe('secret123');
    });

    it('should preserve other login config fields', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      const resolved = resolveLoginConfig(baseLoginConfig);

      expect(resolved.loginUrl).toBe('https://example.com/login');
      expect(resolved.usernameSelector).toBe('#username');
      expect(resolved.passwordSelector).toBe('#password');
      expect(resolved.submitSelector).toBe('#submit');
      expect(resolved.successIndicator).toBe('.dashboard');
    });

    it('should preserve optional fields', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      const configWithOptionals: LoginConfig = {
        ...baseLoginConfig,
        tenantValue: 'tenant1',
        tenantAlreadySelected: true,
      };

      const resolved = resolveLoginConfig(configWithOptionals);

      expect(resolved.tenantValue).toBe('tenant1');
      expect(resolved.tenantAlreadySelected).toBe(true);
    });

    it('should handle plain credentials in login config', () => {
      const configWithPlainCredentials: LoginConfig = {
        ...baseLoginConfig,
        credentials: {
          username: 'admin',
          password: 'secret123',
        },
      };

      const resolved = resolveLoginConfig(configWithPlainCredentials);

      expect(resolved.credentials.username).toBe('admin');
      expect(resolved.credentials.password).toBe('secret123');
    });

    it('should throw error for missing env vars in login config', () => {
      delete process.env.TEST_USERNAME;
      delete process.env.TEST_PASSWORD;

      expect(() => resolveLoginConfig(baseLoginConfig)).toThrow(
        'Environment variable TEST_USERNAME is not set'
      );
    });

    it('should not mutate the original login config', () => {
      process.env.TEST_USERNAME = 'admin';
      process.env.TEST_PASSWORD = 'secret123';

      const originalCredentials = { ...baseLoginConfig.credentials };
      const resolved = resolveLoginConfig(baseLoginConfig);

      expect(baseLoginConfig.credentials.username).toBe(originalCredentials.username);
      expect(baseLoginConfig.credentials.password).toBe(originalCredentials.password);
      expect(resolved).not.toBe(baseLoginConfig);
      expect(resolved.credentials).not.toBe(baseLoginConfig.credentials);
    });
  });
});

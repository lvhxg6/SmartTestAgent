/**
 * Unit tests for Target Profile Validator
 * Tests validation functions for Target Profile configuration
 * 
 * @see Requirements 1.2
 */

import { describe, it, expect } from 'vitest';
import {
  validateTargetProfile,
  validateBaseUrl,
  validateRoutes,
  validateLoginConfig,
  validateBrowserConfig,
  validateSourceCodeConfig,
  validateAntdQuirksConfig,
  ValidationErrorCodes,
  type ValidationError,
} from './validator.js';
import type { CreateTargetProfileInput } from './index.js';
import type {
  BrowserConfig,
  LoginConfig,
  SourceCodeConfig,
  AntdQuirksConfig,
} from '@smart-test-agent/shared';

// ============================================================================
// Test Fixtures
// ============================================================================

const createValidBrowserConfig = (): BrowserConfig => ({
  ignoreHTTPSErrors: true,
  viewport: { width: 1920, height: 1080 },
  locale: 'zh-CN',
  timeoutMs: 30000,
});

const createValidLoginConfig = (): LoginConfig => ({
  loginUrl: '/login',
  usernameSelector: '#username',
  passwordSelector: '#password',
  submitSelector: '#submit',
  credentials: {
    username: '$TEST_USERNAME',
    password: '$TEST_PASSWORD',
  },
  successIndicator: '.dashboard',
});

const createValidSourceCodeConfig = (): SourceCodeConfig => ({
  frontendRoot: '/src',
  routerFile: '/src/router/index.ts',
  pageDir: '/src/pages',
  apiDir: '/src/api',
});

const createValidAntdQuirksConfig = (): AntdQuirksConfig => ({
  buttonTextSpace: true,
  selectType: 'custom',
  modalCloseSelector: '.ant-modal-close',
});

const createValidProfileInput = (): CreateTargetProfileInput => ({
  projectId: 'test-project-id',
  baseUrl: 'https://test.example.com',
  browser: createValidBrowserConfig(),
  login: createValidLoginConfig(),
  allowedRoutes: ['/dashboard', '/users', '/settings'],
  deniedRoutes: ['/admin'],
  allowedOperations: ['query', 'view_detail', 'create', 'edit', 'delete'],
  deniedOperations: [],
  sourceCode: createValidSourceCodeConfig(),
  uiFramework: 'antd',
  antdQuirks: createValidAntdQuirksConfig(),
});

// Helper to find error by field
const findErrorByField = (errors: ValidationError[], field: string): ValidationError | undefined => {
  return errors.find(e => e.field === field);
};

// ============================================================================
// validateBaseUrl Tests
// ============================================================================

describe('validateBaseUrl', () => {
  it('should accept valid HTTPS URL', () => {
    const errors = validateBaseUrl('https://example.com');
    expect(errors).toHaveLength(0);
  });

  it('should accept valid HTTP URL', () => {
    const errors = validateBaseUrl('http://example.com');
    expect(errors).toHaveLength(0);
  });

  it('should accept URL with port', () => {
    const errors = validateBaseUrl('https://example.com:8080');
    expect(errors).toHaveLength(0);
  });

  it('should accept URL with path', () => {
    const errors = validateBaseUrl('https://example.com/api/v1');
    expect(errors).toHaveLength(0);
  });

  it('should reject empty URL', () => {
    const errors = validateBaseUrl('');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject whitespace-only URL', () => {
    const errors = validateBaseUrl('   ');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject invalid URL format', () => {
    const errors = validateBaseUrl('not-a-valid-url');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCodes.INVALID_URL);
  });

  it('should reject FTP protocol', () => {
    const errors = validateBaseUrl('ftp://example.com');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCodes.INVALID_URL_PROTOCOL);
  });

  it('should reject file protocol', () => {
    const errors = validateBaseUrl('file:///path/to/file');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCodes.INVALID_URL_PROTOCOL);
  });
});

// ============================================================================
// validateRoutes Tests
// ============================================================================

describe('validateRoutes', () => {
  describe('allowedRoutes validation', () => {
    it('should accept valid routes starting with /', () => {
      const errors = validateRoutes(['/dashboard', '/users', '/settings']);
      expect(errors).toHaveLength(0);
    });

    it('should accept routes with parameters', () => {
      const errors = validateRoutes(['/users/:id', '/posts/:postId/comments']);
      expect(errors).toHaveLength(0);
    });

    it('should accept nested routes', () => {
      const errors = validateRoutes(['/admin/users', '/admin/settings/security']);
      expect(errors).toHaveLength(0);
    });

    it('should reject empty array for allowedRoutes', () => {
      const errors = validateRoutes([], 'allowedRoutes');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(ValidationErrorCodes.EMPTY_ARRAY);
    });

    it('should reject route not starting with /', () => {
      const errors = validateRoutes(['dashboard', '/users']);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(ValidationErrorCodes.INVALID_ROUTE_FORMAT);
      expect(errors[0].field).toBe('allowedRoutes[0]');
    });

    it('should reject empty string route', () => {
      const errors = validateRoutes(['/dashboard', '', '/settings']);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(ValidationErrorCodes.EMPTY_STRING);
      expect(errors[0].field).toBe('allowedRoutes[1]');
    });

    it('should report multiple invalid routes', () => {
      const errors = validateRoutes(['dashboard', 'users', '/settings']);
      expect(errors).toHaveLength(2);
      expect(errors[0].field).toBe('allowedRoutes[0]');
      expect(errors[1].field).toBe('allowedRoutes[1]');
    });
  });

  describe('deniedRoutes validation', () => {
    it('should accept empty array for deniedRoutes', () => {
      const errors = validateRoutes([], 'deniedRoutes');
      expect(errors).toHaveLength(0);
    });

    it('should validate deniedRoutes format', () => {
      const errors = validateRoutes(['admin', '/settings'], 'deniedRoutes');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('deniedRoutes[0]');
    });
  });
});

// ============================================================================
// validateLoginConfig Tests
// ============================================================================

describe('validateLoginConfig', () => {
  it('should accept valid login config with path', () => {
    const config = createValidLoginConfig();
    const errors = validateLoginConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid login config with full URL', () => {
    const config = createValidLoginConfig();
    config.loginUrl = 'https://auth.example.com/login';
    const errors = validateLoginConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty loginUrl', () => {
    const config = createValidLoginConfig();
    config.loginUrl = '';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.loginUrl');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject invalid loginUrl format', () => {
    const config = createValidLoginConfig();
    config.loginUrl = 'not-a-url-or-path';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.loginUrl');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.INVALID_URL);
  });

  it('should reject empty usernameSelector', () => {
    const config = createValidLoginConfig();
    config.usernameSelector = '';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.usernameSelector');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject whitespace-only usernameSelector', () => {
    const config = createValidLoginConfig();
    config.usernameSelector = '   ';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.usernameSelector');
    expect(error).toBeDefined();
  });

  it('should reject empty passwordSelector', () => {
    const config = createValidLoginConfig();
    config.passwordSelector = '';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.passwordSelector');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject empty submitSelector', () => {
    const config = createValidLoginConfig();
    config.submitSelector = '';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.submitSelector');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject empty successIndicator', () => {
    const config = createValidLoginConfig();
    config.successIndicator = '';
    const errors = validateLoginConfig(config);
    const error = findErrorByField(errors, 'login.successIndicator');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should report multiple errors for multiple invalid fields', () => {
    const config = createValidLoginConfig();
    config.usernameSelector = '';
    config.passwordSelector = '';
    config.submitSelector = '';
    const errors = validateLoginConfig(config);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// validateBrowserConfig Tests
// ============================================================================

describe('validateBrowserConfig', () => {
  it('should accept valid browser config', () => {
    const config = createValidBrowserConfig();
    const errors = validateBrowserConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should accept minimum valid viewport dimensions', () => {
    const config = createValidBrowserConfig();
    config.viewport = { width: 1, height: 1 };
    const errors = validateBrowserConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should reject zero viewport width', () => {
    const config = createValidBrowserConfig();
    config.viewport.width = 0;
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.viewport.width');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.NON_POSITIVE_NUMBER);
  });

  it('should reject negative viewport width', () => {
    const config = createValidBrowserConfig();
    config.viewport.width = -100;
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.viewport.width');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.NON_POSITIVE_NUMBER);
  });

  it('should reject zero viewport height', () => {
    const config = createValidBrowserConfig();
    config.viewport.height = 0;
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.viewport.height');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.NON_POSITIVE_NUMBER);
  });

  it('should reject negative viewport height', () => {
    const config = createValidBrowserConfig();
    config.viewport.height = -100;
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.viewport.height');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.NON_POSITIVE_NUMBER);
  });

  it('should reject zero timeoutMs', () => {
    const config = createValidBrowserConfig();
    config.timeoutMs = 0;
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.timeoutMs');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.NON_POSITIVE_NUMBER);
  });

  it('should reject negative timeoutMs', () => {
    const config = createValidBrowserConfig();
    config.timeoutMs = -1000;
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.timeoutMs');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.NON_POSITIVE_NUMBER);
  });

  it('should reject non-number viewport width', () => {
    const config = createValidBrowserConfig();
    (config.viewport as any).width = 'invalid';
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.viewport.width');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.INVALID_NUMBER);
  });

  it('should reject non-number timeoutMs', () => {
    const config = createValidBrowserConfig();
    (config as any).timeoutMs = 'invalid';
    const errors = validateBrowserConfig(config);
    const error = findErrorByField(errors, 'browser.timeoutMs');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.INVALID_NUMBER);
  });
});

// ============================================================================
// validateSourceCodeConfig Tests
// ============================================================================

describe('validateSourceCodeConfig', () => {
  it('should accept valid source code config', () => {
    const config = createValidSourceCodeConfig();
    const errors = validateSourceCodeConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty frontendRoot', () => {
    const config = createValidSourceCodeConfig();
    config.frontendRoot = '';
    const errors = validateSourceCodeConfig(config);
    const error = findErrorByField(errors, 'sourceCode.frontendRoot');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject whitespace-only frontendRoot', () => {
    const config = createValidSourceCodeConfig();
    config.frontendRoot = '   ';
    const errors = validateSourceCodeConfig(config);
    const error = findErrorByField(errors, 'sourceCode.frontendRoot');
    expect(error).toBeDefined();
  });

  it('should reject empty routerFile', () => {
    const config = createValidSourceCodeConfig();
    config.routerFile = '';
    const errors = validateSourceCodeConfig(config);
    const error = findErrorByField(errors, 'sourceCode.routerFile');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject empty pageDir', () => {
    const config = createValidSourceCodeConfig();
    config.pageDir = '';
    const errors = validateSourceCodeConfig(config);
    const error = findErrorByField(errors, 'sourceCode.pageDir');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject empty apiDir', () => {
    const config = createValidSourceCodeConfig();
    config.apiDir = '';
    const errors = validateSourceCodeConfig(config);
    const error = findErrorByField(errors, 'sourceCode.apiDir');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should report multiple errors for multiple empty fields', () => {
    const config = createValidSourceCodeConfig();
    config.frontendRoot = '';
    config.routerFile = '';
    config.pageDir = '';
    config.apiDir = '';
    const errors = validateSourceCodeConfig(config);
    expect(errors).toHaveLength(4);
  });
});

// ============================================================================
// validateAntdQuirksConfig Tests
// ============================================================================

describe('validateAntdQuirksConfig', () => {
  it('should accept valid antd quirks config', () => {
    const config = createValidAntdQuirksConfig();
    const errors = validateAntdQuirksConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should accept undefined config (optional)', () => {
    const errors = validateAntdQuirksConfig(undefined);
    expect(errors).toHaveLength(0);
  });

  it('should accept selectType "custom"', () => {
    const config = createValidAntdQuirksConfig();
    config.selectType = 'custom';
    const errors = validateAntdQuirksConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should accept selectType "native"', () => {
    const config = createValidAntdQuirksConfig();
    config.selectType = 'native';
    const errors = validateAntdQuirksConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid selectType', () => {
    const config = createValidAntdQuirksConfig();
    (config as any).selectType = 'invalid';
    const errors = validateAntdQuirksConfig(config);
    const error = findErrorByField(errors, 'antdQuirks.selectType');
    expect(error).toBeDefined();
  });

  it('should reject empty modalCloseSelector', () => {
    const config = createValidAntdQuirksConfig();
    config.modalCloseSelector = '';
    const errors = validateAntdQuirksConfig(config);
    const error = findErrorByField(errors, 'antdQuirks.modalCloseSelector');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.EMPTY_STRING);
  });

  it('should reject whitespace-only modalCloseSelector', () => {
    const config = createValidAntdQuirksConfig();
    config.modalCloseSelector = '   ';
    const errors = validateAntdQuirksConfig(config);
    const error = findErrorByField(errors, 'antdQuirks.modalCloseSelector');
    expect(error).toBeDefined();
  });
});

// ============================================================================
// validateTargetProfile Tests (Complete Profile Validation)
// ============================================================================

describe('validateTargetProfile', () => {
  it('should accept valid complete profile', () => {
    const profile = createValidProfileInput();
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept profile without optional antdQuirks', () => {
    const profile = createValidProfileInput();
    delete (profile as any).antdQuirks;
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(true);
  });

  it('should accept profile without optional deniedRoutes', () => {
    const profile = createValidProfileInput();
    delete (profile as any).deniedRoutes;
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(true);
  });

  it('should reject empty projectId', () => {
    const profile = createValidProfileInput();
    profile.projectId = '';
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'projectId');
    expect(error).toBeDefined();
    expect(error?.code).toBe(ValidationErrorCodes.REQUIRED_FIELD);
  });

  it('should reject invalid baseUrl', () => {
    const profile = createValidProfileInput();
    profile.baseUrl = 'not-a-url';
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'baseUrl');
    expect(error).toBeDefined();
  });

  it('should reject invalid routes', () => {
    const profile = createValidProfileInput();
    profile.allowedRoutes = ['dashboard', '/users']; // First one missing /
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'allowedRoutes[0]');
    expect(error).toBeDefined();
  });

  it('should reject invalid deniedRoutes', () => {
    const profile = createValidProfileInput();
    profile.deniedRoutes = ['admin']; // Missing /
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'deniedRoutes[0]');
    expect(error).toBeDefined();
  });

  it('should reject invalid login config', () => {
    const profile = createValidProfileInput();
    profile.login.usernameSelector = '';
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'login.usernameSelector');
    expect(error).toBeDefined();
  });

  it('should reject invalid browser config', () => {
    const profile = createValidProfileInput();
    profile.browser.viewport.width = -100;
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'browser.viewport.width');
    expect(error).toBeDefined();
  });

  it('should reject invalid source code config', () => {
    const profile = createValidProfileInput();
    profile.sourceCode.frontendRoot = '';
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    const error = findErrorByField(result.errors, 'sourceCode.frontendRoot');
    expect(error).toBeDefined();
  });

  it('should collect all errors from multiple invalid sections', () => {
    const profile = createValidProfileInput();
    profile.projectId = '';
    profile.baseUrl = 'invalid';
    profile.login.usernameSelector = '';
    profile.browser.viewport.width = 0;
    profile.sourceCode.frontendRoot = '';
    
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('should validate deniedRoutes only when provided and non-empty', () => {
    const profile = createValidProfileInput();
    profile.deniedRoutes = []; // Empty array should be valid
    const result = validateTargetProfile(profile);
    expect(result.valid).toBe(true);
  });
});

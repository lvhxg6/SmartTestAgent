/**
 * Target Profile Validator Module
 * Provides validation functions for Target Profile configuration
 * 
 * @see Requirements 1.2
 */

import type {
  BrowserConfig,
  LoginConfig,
  SourceCodeConfig,
  AntdQuirksConfig,
} from '@smart-test-agent/shared';

import type { CreateTargetProfileInput } from './index.js';

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error with field, message, and error code
 */
export interface ValidationError {
  /** Field path that failed validation (e.g., 'login.usernameSelector') */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
}

/**
 * Validation result containing validity status and any errors
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
}

// ============================================================================
// Validation Error Codes
// ============================================================================

export const ValidationErrorCodes = {
  // Required field errors
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  EMPTY_STRING: 'EMPTY_STRING',
  
  // URL validation errors
  INVALID_URL: 'INVALID_URL',
  INVALID_URL_PROTOCOL: 'INVALID_URL_PROTOCOL',
  
  // Route validation errors
  INVALID_ROUTE_FORMAT: 'INVALID_ROUTE_FORMAT',
  
  // Number validation errors
  INVALID_NUMBER: 'INVALID_NUMBER',
  NON_POSITIVE_NUMBER: 'NON_POSITIVE_NUMBER',
  
  // Array validation errors
  EMPTY_ARRAY: 'EMPTY_ARRAY',
} as const;

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate a URL string
 * Must be a valid HTTP or HTTPS URL
 * 
 * @param url - The URL string to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateBaseUrl(url: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const field = 'baseUrl';

  // Check if empty
  if (!url || url.trim() === '') {
    errors.push({
      field,
      message: 'Base URL is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
    return errors;
  }

  // Try to parse as URL
  try {
    const parsedUrl = new URL(url);
    
    // Check protocol
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      errors.push({
        field,
        message: 'Base URL must use HTTP or HTTPS protocol',
        code: ValidationErrorCodes.INVALID_URL_PROTOCOL,
      });
    }
  } catch {
    errors.push({
      field,
      message: 'Base URL must be a valid URL',
      code: ValidationErrorCodes.INVALID_URL,
    });
  }

  return errors;
}

// ============================================================================
// Route Validation
// ============================================================================

/**
 * Validate a single route path
 * Route must start with /
 * 
 * @param route - The route path to validate
 * @param fieldPrefix - Field prefix for error reporting
 * @param index - Index in the array for error reporting
 * @returns Validation error or null if valid
 */
function validateSingleRoute(route: string, fieldPrefix: string, index: number): ValidationError | null {
  if (!route || route.trim() === '') {
    return {
      field: `${fieldPrefix}[${index}]`,
      message: 'Route path cannot be empty',
      code: ValidationErrorCodes.EMPTY_STRING,
    };
  }

  if (!route.startsWith('/')) {
    return {
      field: `${fieldPrefix}[${index}]`,
      message: `Route path must start with / (got: "${route}")`,
      code: ValidationErrorCodes.INVALID_ROUTE_FORMAT,
    };
  }

  return null;
}

/**
 * Validate an array of route paths
 * Each route must start with /
 * 
 * @param routes - Array of route paths to validate
 * @param fieldName - Field name for error reporting (default: 'allowedRoutes')
 * @returns Array of validation errors (empty if valid)
 */
export function validateRoutes(routes: string[], fieldName: string = 'allowedRoutes'): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if array is empty (only for allowedRoutes, deniedRoutes can be empty)
  if (fieldName === 'allowedRoutes' && (!routes || routes.length === 0)) {
    errors.push({
      field: fieldName,
      message: 'At least one allowed route is required',
      code: ValidationErrorCodes.EMPTY_ARRAY,
    });
    return errors;
  }

  // Validate each route
  if (routes) {
    for (let i = 0; i < routes.length; i++) {
      const error = validateSingleRoute(routes[i], fieldName, i);
      if (error) {
        errors.push(error);
      }
    }
  }

  return errors;
}

// ============================================================================
// Login Config Validation
// ============================================================================

/**
 * Validate a login URL or path
 * Must be a valid URL or a path starting with /
 * 
 * @param loginUrl - The login URL to validate
 * @returns Validation error or null if valid
 */
function validateLoginUrl(loginUrl: string): ValidationError | null {
  const field = 'login.loginUrl';

  if (!loginUrl || loginUrl.trim() === '') {
    return {
      field,
      message: 'Login URL is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    };
  }

  // Check if it's a path starting with /
  if (loginUrl.startsWith('/')) {
    return null; // Valid path
  }

  // Try to parse as URL
  try {
    const parsedUrl = new URL(loginUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        field,
        message: 'Login URL must use HTTP or HTTPS protocol, or be a path starting with /',
        code: ValidationErrorCodes.INVALID_URL_PROTOCOL,
      };
    }
    return null; // Valid URL
  } catch {
    return {
      field,
      message: 'Login URL must be a valid URL or a path starting with /',
      code: ValidationErrorCodes.INVALID_URL,
    };
  }
}

/**
 * Validate login configuration
 * Validates required fields: loginUrl, usernameSelector, passwordSelector, submitSelector, successIndicator
 * 
 * @param config - The login configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateLoginConfig(config: LoginConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate loginUrl
  const loginUrlError = validateLoginUrl(config.loginUrl);
  if (loginUrlError) {
    errors.push(loginUrlError);
  }

  // Validate usernameSelector
  if (!config.usernameSelector || config.usernameSelector.trim() === '') {
    errors.push({
      field: 'login.usernameSelector',
      message: 'Username selector is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate passwordSelector
  if (!config.passwordSelector || config.passwordSelector.trim() === '') {
    errors.push({
      field: 'login.passwordSelector',
      message: 'Password selector is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate submitSelector
  if (!config.submitSelector || config.submitSelector.trim() === '') {
    errors.push({
      field: 'login.submitSelector',
      message: 'Submit selector is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate successIndicator
  if (!config.successIndicator || config.successIndicator.trim() === '') {
    errors.push({
      field: 'login.successIndicator',
      message: 'Success indicator is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  return errors;
}

// ============================================================================
// Browser Config Validation
// ============================================================================

/**
 * Validate browser configuration
 * Validates viewport dimensions and timeout
 * 
 * @param config - The browser configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateBrowserConfig(config: BrowserConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate viewport width
  if (typeof config.viewport?.width !== 'number') {
    errors.push({
      field: 'browser.viewport.width',
      message: 'Viewport width must be a number',
      code: ValidationErrorCodes.INVALID_NUMBER,
    });
  } else if (config.viewport.width <= 0) {
    errors.push({
      field: 'browser.viewport.width',
      message: 'Viewport width must be a positive number',
      code: ValidationErrorCodes.NON_POSITIVE_NUMBER,
    });
  }

  // Validate viewport height
  if (typeof config.viewport?.height !== 'number') {
    errors.push({
      field: 'browser.viewport.height',
      message: 'Viewport height must be a number',
      code: ValidationErrorCodes.INVALID_NUMBER,
    });
  } else if (config.viewport.height <= 0) {
    errors.push({
      field: 'browser.viewport.height',
      message: 'Viewport height must be a positive number',
      code: ValidationErrorCodes.NON_POSITIVE_NUMBER,
    });
  }

  // Validate timeoutMs
  if (typeof config.timeoutMs !== 'number') {
    errors.push({
      field: 'browser.timeoutMs',
      message: 'Timeout must be a number',
      code: ValidationErrorCodes.INVALID_NUMBER,
    });
  } else if (config.timeoutMs <= 0) {
    errors.push({
      field: 'browser.timeoutMs',
      message: 'Timeout must be a positive number',
      code: ValidationErrorCodes.NON_POSITIVE_NUMBER,
    });
  }

  return errors;
}

// ============================================================================
// Source Code Config Validation
// ============================================================================

/**
 * Validate source code configuration
 * Validates required fields: frontendRoot, routerFile, pageDir, apiDir
 * 
 * @param config - The source code configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateSourceCodeConfig(config: SourceCodeConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate frontendRoot
  if (!config.frontendRoot || config.frontendRoot.trim() === '') {
    errors.push({
      field: 'sourceCode.frontendRoot',
      message: 'Frontend root path is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate routerFile
  if (!config.routerFile || config.routerFile.trim() === '') {
    errors.push({
      field: 'sourceCode.routerFile',
      message: 'Router file path is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate pageDir
  if (!config.pageDir || config.pageDir.trim() === '') {
    errors.push({
      field: 'sourceCode.pageDir',
      message: 'Page directory path is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate apiDir
  if (!config.apiDir || config.apiDir.trim() === '') {
    errors.push({
      field: 'sourceCode.apiDir',
      message: 'API directory path is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  return errors;
}

// ============================================================================
// Antd Quirks Config Validation (Optional)
// ============================================================================

/**
 * Validate Ant Design quirks configuration (if provided)
 * 
 * @param config - The Ant Design quirks configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateAntdQuirksConfig(config: AntdQuirksConfig | undefined): ValidationError[] {
  const errors: ValidationError[] = [];

  // If config is not provided, it's valid (optional)
  if (!config) {
    return errors;
  }

  // Validate selectType
  if (config.selectType !== 'custom' && config.selectType !== 'native') {
    errors.push({
      field: 'antdQuirks.selectType',
      message: 'Select type must be "custom" or "native"',
      code: ValidationErrorCodes.INVALID_NUMBER, // Reusing code for invalid value
    });
  }

  // Validate modalCloseSelector (should not be empty if provided)
  if (config.modalCloseSelector !== undefined && config.modalCloseSelector.trim() === '') {
    errors.push({
      field: 'antdQuirks.modalCloseSelector',
      message: 'Modal close selector cannot be empty',
      code: ValidationErrorCodes.EMPTY_STRING,
    });
  }

  return errors;
}

// ============================================================================
// Complete Profile Validation
// ============================================================================

/**
 * Validate an entire Target Profile configuration
 * Validates all required fields and nested configurations
 * 
 * @param profile - The profile input to validate
 * @returns ValidationResult with valid status and any errors
 * 
 * @see Requirements 1.2
 */
export function validateTargetProfile(profile: CreateTargetProfileInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate projectId
  if (!profile.projectId || profile.projectId.trim() === '') {
    errors.push({
      field: 'projectId',
      message: 'Project ID is required',
      code: ValidationErrorCodes.REQUIRED_FIELD,
    });
  }

  // Validate baseUrl
  errors.push(...validateBaseUrl(profile.baseUrl));

  // Validate allowedRoutes
  errors.push(...validateRoutes(profile.allowedRoutes, 'allowedRoutes'));

  // Validate deniedRoutes (if provided)
  if (profile.deniedRoutes && profile.deniedRoutes.length > 0) {
    errors.push(...validateRoutes(profile.deniedRoutes, 'deniedRoutes'));
  }

  // Validate login config
  errors.push(...validateLoginConfig(profile.login));

  // Validate browser config
  errors.push(...validateBrowserConfig(profile.browser));

  // Validate source code config
  errors.push(...validateSourceCodeConfig(profile.sourceCode));

  // Validate antd quirks config (optional)
  errors.push(...validateAntdQuirksConfig(profile.antdQuirks));

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Environment Variable Resolver Module
 * Resolves environment variable references in configuration values
 * 
 * Supports $VAR_NAME format for environment variable references
 * 
 * @see Requirements 1.3
 */

import type { LoginConfig } from '@smart-test-agent/shared';

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex pattern to match environment variable references
 * Matches $VAR_NAME format where VAR_NAME consists of uppercase letters, numbers, and underscores
 */
const ENV_VAR_PATTERN = /^\$([A-Z_][A-Z0-9_]*)$/;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Credentials object with username and password
 */
export interface Credentials {
  username: string;
  password: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check if a value is an environment variable reference
 * 
 * @param value - The value to check
 * @returns true if the value is an environment variable reference ($VAR_NAME format)
 * 
 * @example
 * isEnvVariable('$TEST_USERNAME') // true
 * isEnvVariable('plain_value') // false
 * isEnvVariable('$invalid-name') // false
 * isEnvVariable('') // false
 * 
 * @see Requirements 1.3
 */
export function isEnvVariable(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return ENV_VAR_PATTERN.test(value);
}

/**
 * Extract the environment variable name from a reference
 * 
 * @param value - The environment variable reference (e.g., '$TEST_USERNAME')
 * @returns The variable name without the $ prefix, or null if not a valid reference
 * 
 * @example
 * extractEnvVarName('$TEST_USERNAME') // 'TEST_USERNAME'
 * extractEnvVarName('plain_value') // null
 */
export function extractEnvVarName(value: string): string | null {
  const match = value.match(ENV_VAR_PATTERN);
  return match ? match[1] : null;
}

/**
 * Resolve a single environment variable reference
 * 
 * If the value is an environment variable reference ($VAR_NAME format),
 * it will be resolved from process.env. Plain values are returned as-is.
 * 
 * @param value - The value to resolve (may be an env var reference or plain value)
 * @returns The resolved value
 * @throws Error if the value is an env var reference but the variable is not set
 * 
 * @example
 * // With process.env.TEST_USERNAME = 'admin'
 * resolveEnvVariable('$TEST_USERNAME') // 'admin'
 * resolveEnvVariable('plain_value') // 'plain_value'
 * resolveEnvVariable('$UNDEFINED_VAR') // throws Error
 * 
 * @see Requirements 1.3
 */
export function resolveEnvVariable(value: string): string {
  // Return plain values as-is
  if (!isEnvVariable(value)) {
    return value;
  }

  // Extract the variable name
  const varName = extractEnvVarName(value);
  if (!varName) {
    // This shouldn't happen if isEnvVariable returned true, but handle it anyway
    return value;
  }

  // Look up the environment variable
  const envValue = process.env[varName];

  // Throw error if the environment variable is not set
  if (envValue === undefined) {
    throw new Error(
      `Environment variable ${varName} is not set. ` +
      `Please set the ${varName} environment variable before running tests.`
    );
  }

  return envValue;
}

/**
 * Resolve credentials object with environment variable references
 * 
 * Both username and password fields support environment variable references.
 * Plain values are returned as-is.
 * 
 * @param credentials - The credentials object with potential env var references
 * @returns A new credentials object with resolved values
 * @throws Error if any env var reference cannot be resolved
 * 
 * @example
 * // With process.env.TEST_USERNAME = 'admin', process.env.TEST_PASSWORD = 'secret'
 * resolveCredentials({ username: '$TEST_USERNAME', password: '$TEST_PASSWORD' })
 * // Returns: { username: 'admin', password: 'secret' }
 * 
 * resolveCredentials({ username: 'admin', password: 'secret' })
 * // Returns: { username: 'admin', password: 'secret' }
 * 
 * @see Requirements 1.3
 */
export function resolveCredentials(credentials: Credentials): Credentials {
  return {
    username: resolveEnvVariable(credentials.username),
    password: resolveEnvVariable(credentials.password),
  };
}

/**
 * Resolve all environment variable references in a LoginConfig
 * 
 * Currently resolves environment variables in the credentials field.
 * Other fields are returned as-is.
 * 
 * @param config - The LoginConfig with potential env var references
 * @returns A new LoginConfig with resolved values
 * @throws Error if any env var reference cannot be resolved
 * 
 * @example
 * // With process.env.TEST_USERNAME = 'admin', process.env.TEST_PASSWORD = 'secret'
 * const config = {
 *   loginUrl: 'https://example.com/login',
 *   usernameSelector: '#username',
 *   passwordSelector: '#password',
 *   submitSelector: '#submit',
 *   credentials: { username: '$TEST_USERNAME', password: '$TEST_PASSWORD' },
 *   successIndicator: '.dashboard'
 * };
 * resolveLoginConfig(config)
 * // Returns config with credentials.username = 'admin', credentials.password = 'secret'
 * 
 * @see Requirements 1.3
 */
export function resolveLoginConfig(config: LoginConfig): LoginConfig {
  return {
    ...config,
    credentials: resolveCredentials(config.credentials),
  };
}

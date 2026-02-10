/**
 * JSON Schema Definitions and Validator
 * @see Requirements 3.2, 4.7, 5.2, 7.5
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

// Import schemas with type assertion
import requirementsSchema from './requirements.schema.json' with { type: 'json' };
import testCasesSchema from './test-cases.schema.json' with { type: 'json' };
import executionResultsSchema from './execution-results.schema.json' with { type: 'json' };
import codexReviewResultsSchema from './codex-review-results.schema.json' with { type: 'json' };

// Schema types
export type SchemaType =
  | 'requirements'
  | 'test-cases'
  | 'execution-results'
  | 'codex-review-results';

// Schema map
const schemas: Record<SchemaType, object> = {
  requirements: requirementsSchema,
  'test-cases': testCasesSchema,
  'execution-results': executionResultsSchema,
  'codex-review-results': codexReviewResultsSchema,
};

// Create AJV instance
const ajv = new Ajv.default({
  allErrors: true,
  verbose: true,
  strict: false,
});

// Add format validators
(addFormats as unknown as (ajv: Ajv.default) => void)(ajv);

// Compile schemas
const validators: Record<SchemaType, ReturnType<typeof ajv.compile>> = {
  requirements: ajv.compile(requirementsSchema),
  'test-cases': ajv.compile(testCasesSchema),
  'execution-results': ajv.compile(executionResultsSchema),
  'codex-review-results': ajv.compile(codexReviewResultsSchema),
};

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

/**
 * Validate data against a schema
 */
export function validate(schemaType: SchemaType, data: unknown): ValidationResult {
  const validator = validators[schemaType];

  if (!validator) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: `Unknown schema type: ${schemaType}`,
          keyword: 'schema',
          params: { schemaType },
        },
      ],
    };
  }

  const valid = validator(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = (validator.errors || []).map((err: ErrorObject) => ({
    path: err.instancePath || '/',
    message: err.message || 'Validation error',
    keyword: err.keyword,
    params: err.params as Record<string, unknown>,
  }));

  return { valid: false, errors };
}

/**
 * Validate requirements.json
 */
export function validateRequirements(data: unknown): ValidationResult {
  return validate('requirements', data);
}

/**
 * Validate test-cases.json
 */
export function validateTestCases(data: unknown): ValidationResult {
  return validate('test-cases', data);
}

/**
 * Validate execution-results.json
 */
export function validateExecutionResults(data: unknown): ValidationResult {
  return validate('execution-results', data);
}

/**
 * Validate codex-review-results.json
 */
export function validateCodexReviewResults(data: unknown): ValidationResult {
  return validate('codex-review-results', data);
}

/**
 * Get schema by type
 */
export function getSchema(schemaType: SchemaType): object {
  return schemas[schemaType];
}

/**
 * Get all schema types
 */
export function getSchemaTypes(): SchemaType[] {
  return Object.keys(schemas) as SchemaType[];
}

/**
 * Format validation errors as string
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'Validation passed';
  }

  const lines = ['Validation failed:'];
  for (const error of result.errors) {
    lines.push(`  - ${error.path}: ${error.message} (${error.keyword})`);
  }

  return lines.join('\n');
}

// Re-export schemas
export {
  requirementsSchema,
  testCasesSchema,
  executionResultsSchema,
  codexReviewResultsSchema,
};

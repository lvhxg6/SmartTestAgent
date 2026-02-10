/**
 * Unit tests for JSON Schema Validator
 * @see Requirements 3.2, 4.7, 5.2, 7.5, 8.3
 */

import { describe, it, expect } from 'vitest';
import {
  validate,
  validateRequirements,
  validateTestCases,
  validateExecutionResults,
  validateCodexReviewResults,
  getSchema,
  getSchemaTypes,
  formatValidationErrors,
} from './index';

describe('JSON Schema Validator', () => {
  describe('validateRequirements', () => {
    it('should validate valid requirements', () => {
      const data = {
        runId: 'run-001',
        requirements: [
          {
            requirementId: 'REQ-001',
            title: 'User Login',
            description: 'User should be able to login',
            priority: 'P0',
            testable: true,
            route: '/login',
            acceptanceCriteria: ['User can enter credentials', 'User sees dashboard after login'],
          },
        ],
      };

      const result = validateRequirements(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing runId', () => {
      const data = {
        requirements: [],
      };

      const result = validateRequirements(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message?.includes('runId'))).toBe(true);
    });

    it('should reject invalid priority', () => {
      const data = {
        runId: 'run-001',
        requirements: [
          {
            requirementId: 'REQ-001',
            title: 'Test',
            description: 'Test',
            priority: 'P3', // Invalid
            testable: true,
            route: '/test',
            acceptanceCriteria: [],
          },
        ],
      };

      const result = validateRequirements(data);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid requirementId format', () => {
      const data = {
        runId: 'run-001',
        requirements: [
          {
            requirementId: 'INVALID', // Should be REQ-XXX
            title: 'Test',
            description: 'Test',
            priority: 'P1',
            testable: true,
            route: '/test',
            acceptanceCriteria: [],
          },
        ],
      };

      const result = validateRequirements(data);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTestCases', () => {
    it('should validate valid test cases', () => {
      const data = {
        runId: 'run-001',
        testCases: [
          {
            caseId: 'TC-001',
            requirementId: 'REQ-001',
            route: '/login',
            title: 'Login Test',
            precondition: 'User is on login page',
            steps: [
              { stepNumber: 1, action: 'Enter username' },
              { stepNumber: 2, action: 'Enter password' },
              { stepNumber: 3, action: 'Click login' },
            ],
            assertions: [
              {
                assertionId: 'A-001',
                type: 'element_visible',
                description: 'Dashboard is visible',
                expected: 'Dashboard header',
              },
            ],
          },
        ],
      };

      const result = validateTestCases(data);
      expect(result.valid).toBe(true);
    });

    it('should reject empty steps', () => {
      const data = {
        runId: 'run-001',
        testCases: [
          {
            caseId: 'TC-001',
            requirementId: 'REQ-001',
            route: '/test',
            title: 'Test',
            precondition: 'None',
            steps: [], // Empty
            assertions: [
              {
                assertionId: 'A-001',
                type: 'element_visible',
                description: 'Test',
                expected: 'Test',
              },
            ],
          },
        ],
      };

      const result = validateTestCases(data);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid assertion type', () => {
      const data = {
        runId: 'run-001',
        testCases: [
          {
            caseId: 'TC-001',
            requirementId: 'REQ-001',
            route: '/test',
            title: 'Test',
            precondition: 'None',
            steps: [{ stepNumber: 1, action: 'Test' }],
            assertions: [
              {
                assertionId: 'A-001',
                type: 'invalid_type', // Invalid
                description: 'Test',
                expected: 'Test',
              },
            ],
          },
        ],
      };

      const result = validateTestCases(data);
      expect(result.valid).toBe(false);
    });

    it('should validate data preparation steps', () => {
      const data = {
        runId: 'run-001',
        testCases: [
          {
            caseId: 'TC-001',
            requirementId: 'REQ-001',
            route: '/test',
            title: 'Test',
            precondition: 'None',
            steps: [{ stepNumber: 1, action: 'Test' }],
            assertions: [
              {
                assertionId: 'A-001',
                type: 'element_visible',
                description: 'Test',
                expected: 'Test',
              },
            ],
            dataPreparation: [
              { action: 'create', target: 'user', data: { name: 'Test' } },
            ],
            dataCleanup: [
              { action: 'delete', target: 'user', cleanup: true },
            ],
          },
        ],
      };

      const result = validateTestCases(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateExecutionResults', () => {
    it('should validate valid execution results', () => {
      const data = {
        runId: 'run-001',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        totalDurationMs: 60000,
        testCases: [
          {
            caseId: 'TC-001',
            status: 'passed',
            steps: [
              { stepNumber: 1, success: true, durationMs: 100 },
            ],
            assertions: [
              {
                assertionId: 'A-001',
                type: 'element_visible',
                description: 'Test',
                expected: 'Test',
                machineVerdict: 'pass',
              },
            ],
            durationMs: 1000,
          },
        ],
        screenshots: [
          {
            id: 'ss-001',
            caseId: 'TC-001',
            stepNumber: 1,
            path: '/evidence/screenshots/ss-001.png',
            timestamp: '2024-01-01T00:00:30Z',
          },
        ],
        success: true,
      };

      const result = validateExecutionResults(data);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid status', () => {
      const data = {
        runId: 'run-001',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        totalDurationMs: 60000,
        testCases: [
          {
            caseId: 'TC-001',
            status: 'invalid', // Invalid
            steps: [],
            assertions: [],
            durationMs: 0,
          },
        ],
        screenshots: [],
        success: false,
      };

      const result = validateExecutionResults(data);
      expect(result.valid).toBe(false);
    });

    it('should validate with reason code', () => {
      const data = {
        runId: 'run-001',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        totalDurationMs: 60000,
        testCases: [],
        screenshots: [],
        success: false,
        error: 'Playwright timeout',
        reasonCode: 'playwright_error',
      };

      const result = validateExecutionResults(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCodexReviewResults', () => {
    it('should validate valid review results', () => {
      const data = {
        runId: 'run-001',
        reviews: [
          {
            assertionId: 'A-001',
            caseId: 'TC-001',
            reviewVerdict: 'agree',
            reasoning: 'The assertion correctly verifies the expected behavior',
          },
        ],
        p0CoverageCheck: {
          status: 'pass',
          missingP0Ids: [],
        },
        falsePositives: [],
        falseNegatives: [],
      };

      const result = validateCodexReviewResults(data);
      expect(result.valid).toBe(true);
    });

    it('should validate disagree with conflict type', () => {
      const data = {
        runId: 'run-001',
        reviews: [
          {
            assertionId: 'A-001',
            caseId: 'TC-001',
            reviewVerdict: 'disagree',
            reasoning: 'The expected value does not match the actual behavior',
            conflictType: 'fact_conflict',
          },
        ],
      };

      const result = validateCodexReviewResults(data);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid review verdict', () => {
      const data = {
        runId: 'run-001',
        reviews: [
          {
            assertionId: 'A-001',
            caseId: 'TC-001',
            reviewVerdict: 'invalid', // Invalid
            reasoning: 'Test',
          },
        ],
      };

      const result = validateCodexReviewResults(data);
      expect(result.valid).toBe(false);
    });

    it('should validate P0 coverage check', () => {
      const data = {
        runId: 'run-001',
        reviews: [],
        p0CoverageCheck: {
          status: 'fail',
          missingP0Ids: ['REQ-001', 'REQ-002'],
        },
      };

      const result = validateCodexReviewResults(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate', () => {
    it('should return error for unknown schema type', () => {
      const result = validate('unknown' as any, {});
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Unknown schema type');
    });
  });

  describe('getSchema', () => {
    it('should return schema for valid type', () => {
      const schema = getSchema('requirements');
      expect(schema).toBeDefined();
      expect((schema as any).$id).toContain('requirements');
    });
  });

  describe('getSchemaTypes', () => {
    it('should return all schema types', () => {
      const types = getSchemaTypes();
      expect(types).toContain('requirements');
      expect(types).toContain('test-cases');
      expect(types).toContain('execution-results');
      expect(types).toContain('codex-review-results');
    });
  });

  describe('formatValidationErrors', () => {
    it('should format passed validation', () => {
      const result = { valid: true, errors: [] };
      const formatted = formatValidationErrors(result);
      expect(formatted).toBe('Validation passed');
    });

    it('should format failed validation', () => {
      const result = {
        valid: false,
        errors: [
          { path: '/runId', message: 'is required', keyword: 'required', params: {} },
        ],
      };
      const formatted = formatValidationErrors(result);
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('/runId');
      expect(formatted).toContain('is required');
    });
  });
});

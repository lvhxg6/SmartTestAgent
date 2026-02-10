/**
 * Property-Based Tests for JSON Schema Validation
 * **Validates: Requirements 3.2, 4.7, 4.8, 5.2, 7.5, 8.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateRequirements,
  validateTestCases,
  validateExecutionResults,
  validateCodexReviewResults,
} from './index';

/**
 * **Property 8: JSON Output Schema Compliance**
 * 
 * *For any* valid structured data, the schema validator should accept it.
 * *For any* invalid data, the schema validator should reject it with errors.
 * 
 * **Validates: Requirements 3.2, 4.7, 4.8, 5.2, 7.5, 8.3**
 */
describe('Property 8: JSON Output Schema Compliance', () => {
  // Arbitraries for generating valid data
  const requirementIdArb = fc.integer({ min: 1, max: 999 }).map((n) => `REQ-${String(n).padStart(3, '0')}`);
  const caseIdArb = fc.integer({ min: 1, max: 999 }).map((n) => `TC-${String(n).padStart(3, '0')}`);
  const assertionIdArb = fc.integer({ min: 1, max: 999 }).map((n) => `A-${String(n).padStart(3, '0')}`);
  const routeArb = fc.stringMatching(/^\/[a-z][a-z0-9-]*$/);
  const priorityArb = fc.constantFrom('P0', 'P1', 'P2');
  const assertionTypeArb = fc.constantFrom('element_visible', 'text_content', 'element_count', 'navigation', 'soft');
  const verdictArb = fc.constantFrom('pass', 'fail', 'error');
  const reviewVerdictArb = fc.constantFrom('agree', 'disagree', 'uncertain');
  const statusArb = fc.constantFrom('pending', 'running', 'passed', 'failed', 'error');

  describe('Requirements Schema', () => {
    it('should accept valid requirements data', () => {
      const requirementArb = fc.record({
        requirementId: requirementIdArb,
        title: fc.string({ minLength: 1, maxLength: 100 }),
        description: fc.string({ minLength: 0, maxLength: 500 }),
        priority: priorityArb,
        testable: fc.boolean(),
        route: routeArb,
        acceptanceCriteria: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 0, maxLength: 10 }),
      });

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(requirementArb, { minLength: 0, maxLength: 10 }),
          (runId, requirements) => {
            const data = { runId, requirements };
            const result = validateRequirements(data);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject data missing required fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('runId', 'requirements'),
          (missingField) => {
            const data: Record<string, unknown> = {
              runId: 'run-001',
              requirements: [],
            };
            delete data[missingField];

            const result = validateRequirements(data);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Test Cases Schema', () => {
    it('should accept valid test cases data', () => {
      const stepArb = fc.record({
        stepNumber: fc.integer({ min: 1, max: 100 }),
        action: fc.string({ minLength: 1, maxLength: 200 }),
      });

      const assertionArb = fc.record({
        assertionId: assertionIdArb,
        type: assertionTypeArb,
        description: fc.string({ minLength: 1, maxLength: 200 }),
        expected: fc.string({ minLength: 0, maxLength: 200 }),
      });

      const testCaseArb = fc.record({
        caseId: caseIdArb,
        requirementId: requirementIdArb,
        route: routeArb,
        title: fc.string({ minLength: 1, maxLength: 100 }),
        precondition: fc.string({ minLength: 0, maxLength: 200 }),
        steps: fc.array(stepArb, { minLength: 1, maxLength: 10 }),
        assertions: fc.array(assertionArb, { minLength: 1, maxLength: 10 }),
      });

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(testCaseArb, { minLength: 0, maxLength: 5 }),
          (runId, testCases) => {
            const data = { runId, testCases };
            const result = validateTestCases(data);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject test cases with empty steps', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          caseIdArb,
          requirementIdArb,
          routeArb,
          (runId, caseId, requirementId, route) => {
            const data = {
              runId,
              testCases: [
                {
                  caseId,
                  requirementId,
                  route,
                  title: 'Test',
                  precondition: 'None',
                  steps: [], // Empty - should fail
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
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Execution Results Schema', () => {
    it('should accept valid execution results', () => {
      const stepResultArb = fc.record({
        stepNumber: fc.integer({ min: 1, max: 100 }),
        success: fc.boolean(),
        durationMs: fc.integer({ min: 0, max: 60000 }),
      });

      const assertionResultArb = fc.record({
        assertionId: assertionIdArb,
        type: assertionTypeArb,
        description: fc.string({ minLength: 1, maxLength: 200 }),
        expected: fc.string({ minLength: 0, maxLength: 200 }),
        machineVerdict: verdictArb,
      });

      const testCaseResultArb = fc.record({
        caseId: caseIdArb,
        status: statusArb,
        steps: fc.array(stepResultArb, { minLength: 0, maxLength: 10 }),
        assertions: fc.array(assertionResultArb, { minLength: 0, maxLength: 10 }),
        durationMs: fc.integer({ min: 0, max: 300000 }),
      });

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(testCaseResultArb, { minLength: 0, maxLength: 5 }),
          fc.boolean(),
          (runId, testCases, success) => {
            const now = new Date().toISOString();
            const data = {
              runId,
              startTime: now,
              endTime: now,
              totalDurationMs: 1000,
              testCases,
              screenshots: [],
              success,
            };

            const result = validateExecutionResults(data);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Codex Review Results Schema', () => {
    it('should accept valid review results', () => {
      const reviewArb = fc.record({
        assertionId: assertionIdArb,
        caseId: caseIdArb,
        reviewVerdict: reviewVerdictArb,
        reasoning: fc.string({ minLength: 1, maxLength: 500 }),
      });

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(reviewArb, { minLength: 0, maxLength: 10 }),
          (runId, reviews) => {
            const data = { runId, reviews };
            const result = validateCodexReviewResults(data);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should accept review results with P0 coverage check', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.constantFrom('pass', 'fail'),
          fc.array(requirementIdArb, { minLength: 0, maxLength: 5 }),
          (runId, status, missingP0Ids) => {
            const data = {
              runId,
              reviews: [],
              p0CoverageCheck: {
                status,
                missingP0Ids: status === 'fail' ? missingP0Ids : [],
              },
            };

            const result = validateCodexReviewResults(data);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject invalid review verdict', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          assertionIdArb,
          caseIdArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !['agree', 'disagree', 'uncertain'].includes(s)),
          (runId, assertionId, caseId, invalidVerdict) => {
            const data = {
              runId,
              reviews: [
                {
                  assertionId,
                  caseId,
                  reviewVerdict: invalidVerdict,
                  reasoning: 'Test',
                },
              ],
            };

            const result = validateCodexReviewResults(data);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Schema Validation Consistency', () => {
    it('should always return valid boolean and errors array', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          (data) => {
            const result = validateRequirements(data);
            expect(typeof result.valid).toBe('boolean');
            expect(Array.isArray(result.errors)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have empty errors when valid', () => {
      const validData = {
        runId: 'run-001',
        requirements: [],
      };

      const result = validateRequirements(validData);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should have non-empty errors when invalid', () => {
      const invalidData = {};

      const result = validateRequirements(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

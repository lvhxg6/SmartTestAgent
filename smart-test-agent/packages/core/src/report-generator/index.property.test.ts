/**
 * Property-Based Tests for Report Generator
 * **Validates: Requirements 10.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  aggregateDefects,
  countDefectsBySeverity,
  getAffectedRoutes,
  sortDefectsBySeverity,
} from './defect-aggregator.js';
import type { Assertion, TestCase, Requirement, DefectSeverity } from '@smart-test-agent/shared';

/**
 * Property 24: Defect Report Aggregation
 * *For any* set of assertion results, the defect report should contain exactly
 * all assertions with final_verdict = 'fail'.
 * **Validates: Requirements 10.1**
 */
describe('Property 24: Defect Report Aggregation', () => {
  // Arbitraries
  const verdictArb = fc.constantFrom('pass', 'fail', 'error') as fc.Arbitrary<'pass' | 'fail' | 'error'>;
  const severityArb = fc.constantFrom('critical', 'major', 'minor', 'suggestion') as fc.Arbitrary<DefectSeverity>;

  // Generate assertions with unique IDs using index
  const assertionsArb = fc.array(
    fc.record({
      type: fc.constantFrom('element_visible', 'text_content', 'navigation', 'soft') as fc.Arbitrary<'element_visible' | 'text_content' | 'navigation' | 'soft'>,
      description: fc.string({ minLength: 5, maxLength: 50 }),
      expected: fc.string({ minLength: 1, maxLength: 20 }),
      finalVerdict: verdictArb,
    }),
    { minLength: 0, maxLength: 20 }
  ).map((specs) =>
    specs.map((spec, index): Assertion => ({
      id: `id-${index}`,
      assertionId: `A-${String(index).padStart(3, '0')}`,
      runId: 'run-1',
      caseId: `TC-${String(index).padStart(3, '0')}`,
      type: spec.type,
      description: spec.description,
      expected: spec.expected,
      finalVerdict: spec.finalVerdict,
    }))
  );

  /**
   * Property: Defect count equals failed assertion count
   */
  it('should aggregate exactly all failed assertions', () => {
    fc.assert(
      fc.property(
        assertionsArb,
        (assertions) => {
          const defects = aggregateDefects(assertions, [], []);
          const failedCount = assertions.filter(a => a.finalVerdict === 'fail').length;

          // Property: defect count should equal failed assertion count
          expect(defects.length).toBe(failedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Each defect corresponds to a failed assertion
   */
  it('should create defect for each failed assertion', () => {
    fc.assert(
      fc.property(
        assertionsArb.filter(arr => arr.length > 0),
        (assertions) => {
          const defects = aggregateDefects(assertions, [], []);
          const failedAssertionIds = assertions
            .filter(a => a.finalVerdict === 'fail')
            .map(a => a.assertionId);

          // Property: each defect should correspond to a failed assertion
          for (const defect of defects) {
            expect(failedAssertionIds).toContain(defect.assertionId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: No defects for passed/error assertions
   */
  it('should not create defects for passed or error assertions', () => {
    fc.assert(
      fc.property(
        assertionsArb.filter(arr => arr.length > 0),
        (assertions) => {
          const defects = aggregateDefects(assertions, [], []);
          const nonFailedAssertionIds = assertions
            .filter(a => a.finalVerdict !== 'fail')
            .map(a => a.assertionId);

          // Property: no defect should correspond to a non-failed assertion
          for (const defect of defects) {
            expect(nonFailedAssertionIds).not.toContain(defect.assertionId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Defect IDs are unique
   */
  it('should generate unique defect IDs', () => {
    fc.assert(
      fc.property(
        assertionsArb.filter(arr => arr.length > 0),
        (assertions) => {
          const defects = aggregateDefects(assertions, [], []);
          const defectIds = defects.map(d => d.id);
          const uniqueIds = new Set(defectIds);

          // Property: all defect IDs should be unique
          expect(uniqueIds.size).toBe(defectIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Severity count consistency
   */
  it('should have consistent severity counts', () => {
    const defectArb = fc.record({
      id: fc.uuid(),
      severity: severityArb,
      title: fc.string({ minLength: 5, maxLength: 50 }),
      description: fc.string({ minLength: 5, maxLength: 100 }),
      screenshots: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
      operationSteps: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      caseId: fc.string({ minLength: 3, maxLength: 10 }),
      requirementId: fc.string({ minLength: 3, maxLength: 10 }),
      route: fc.string({ minLength: 1, maxLength: 20 }).map(s => `/${s.replace(/[^a-zA-Z0-9-_]/g, '')}`),
    });

    fc.assert(
      fc.property(
        fc.array(defectArb, { minLength: 0, maxLength: 20 }),
        (defects) => {
          const counts = countDefectsBySeverity(defects);
          const total = counts.critical + counts.major + counts.minor + counts.suggestion;

          // Property: sum of severity counts should equal total defects
          expect(total).toBe(defects.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Affected routes are unique
   */
  it('should return unique affected routes', () => {
    const defectArb = fc.record({
      id: fc.uuid(),
      severity: severityArb,
      title: fc.string({ minLength: 5, maxLength: 50 }),
      description: fc.string({ minLength: 5, maxLength: 100 }),
      screenshots: fc.constant([]),
      operationSteps: fc.constant([]),
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      caseId: fc.string({ minLength: 3, maxLength: 10 }),
      requirementId: fc.string({ minLength: 3, maxLength: 10 }),
      route: fc.constantFrom('/dashboard', '/users', '/settings', '/profile'),
    });

    fc.assert(
      fc.property(
        fc.array(defectArb, { minLength: 0, maxLength: 20 }),
        (defects) => {
          const routes = getAffectedRoutes(defects);
          const uniqueRoutes = new Set(routes);

          // Property: all routes should be unique
          expect(uniqueRoutes.size).toBe(routes.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Sorted defects maintain severity order
   */
  it('should sort defects by severity correctly', () => {
    const defectArb = fc.record({
      id: fc.uuid(),
      severity: severityArb,
      title: fc.string({ minLength: 5, maxLength: 50 }),
      description: fc.string({ minLength: 5, maxLength: 100 }),
      screenshots: fc.constant([]),
      operationSteps: fc.constant([]),
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      caseId: fc.string({ minLength: 3, maxLength: 10 }),
      requirementId: fc.string({ minLength: 3, maxLength: 10 }),
      route: fc.string({ minLength: 1, maxLength: 20 }),
    });

    const severityOrder: Record<DefectSeverity, number> = {
      critical: 0,
      major: 1,
      minor: 2,
      suggestion: 3,
    };

    fc.assert(
      fc.property(
        fc.array(defectArb, { minLength: 0, maxLength: 20 }),
        (defects) => {
          const sorted = sortDefectsBySeverity(defects);

          // Property: sorted defects should be in severity order
          for (let i = 1; i < sorted.length; i++) {
            const prevOrder = severityOrder[sorted[i - 1].severity];
            const currOrder = severityOrder[sorted[i].severity];
            expect(prevOrder).toBeLessThanOrEqual(currOrder);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

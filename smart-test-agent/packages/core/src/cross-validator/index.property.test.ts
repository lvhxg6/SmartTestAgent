/**
 * Property-Based Tests for Cross-Validator
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isDeterministicAssertion,
  arbitrateDeterministicAssertion,
  arbitrateSoftAssertion,
  arbitrateAssertion,
  generateArbitrationSummary,
} from './arbitrator.js';
import type { Assertion, AssertionReview, Verdict, ReviewVerdict, AssertionType } from '@smart-test-agent/shared';

/**
 * Property 23: Cross-Validation Arbitration Rules
 * *For any* assertion result with machine_verdict/agent_verdict and Codex review_verdict,
 * the arbitration should follow the defined rules.
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */
describe('Property 23: Cross-Validation Arbitration Rules', () => {
  // Arbitraries
  const verdictArb = fc.constantFrom('pass', 'fail', 'error') as fc.Arbitrary<Verdict>;
  const reviewVerdictArb = fc.constantFrom('agree', 'disagree', 'uncertain') as fc.Arbitrary<ReviewVerdict>;
  const deterministicTypeArb = fc.constantFrom('element_visible', 'text_content', 'element_count', 'navigation') as fc.Arbitrary<AssertionType>;

  /**
   * Rule 9.1: Deterministic assertion + agree → maintain original verdict
   */
  it('should maintain deterministic verdict when Codex agrees', () => {
    fc.assert(
      fc.property(verdictArb, (machineVerdict) => {
        const result = arbitrateDeterministicAssertion(machineVerdict, 'agree');

        // Property: final verdict should equal original verdict
        expect(result.finalVerdict).toBe(machineVerdict);
        expect(result.conflictDetected).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Rule 9.2: Deterministic assertion + disagree → failed
   */
  it('should mark deterministic assertion as failed when Codex disagrees', () => {
    fc.assert(
      fc.property(verdictArb, (machineVerdict) => {
        const result = arbitrateDeterministicAssertion(machineVerdict, 'disagree');

        // Property: final verdict should always be 'fail'
        expect(result.finalVerdict).toBe('fail');
        expect(result.conflictDetected).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Rule 9.3: Deterministic assertion + uncertain → maintain original verdict
   */
  it('should maintain deterministic verdict when Codex is uncertain', () => {
    fc.assert(
      fc.property(verdictArb, (machineVerdict) => {
        const result = arbitrateDeterministicAssertion(machineVerdict, 'uncertain');

        // Property: final verdict should equal original verdict
        expect(result.finalVerdict).toBe(machineVerdict);
        expect(result.conflictDetected).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Rule 9.4: Soft assertion + agree → maintain original verdict
   */
  it('should maintain soft assertion verdict when Codex agrees', () => {
    fc.assert(
      fc.property(verdictArb, (agentVerdict) => {
        const result = arbitrateSoftAssertion(agentVerdict, 'agree');

        // Property: final verdict should equal original verdict
        expect(result.finalVerdict).toBe(agentVerdict);
        expect(result.conflictDetected).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Rule 9.5: Soft assertion + disagree/uncertain → failed
   */
  it('should mark soft assertion as failed when Codex disagrees or is uncertain', () => {
    fc.assert(
      fc.property(
        verdictArb,
        fc.constantFrom('disagree', 'uncertain') as fc.Arbitrary<ReviewVerdict>,
        (agentVerdict, reviewVerdict) => {
          const result = arbitrateSoftAssertion(agentVerdict, reviewVerdict);

          // Property: final verdict should always be 'fail'
          expect(result.finalVerdict).toBe('fail');
          expect(result.conflictDetected).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Deterministic vs Soft assertion type detection
   */
  it('should correctly identify deterministic assertion types', () => {
    fc.assert(
      fc.property(deterministicTypeArb, (type) => {
        // Property: all non-soft types should be deterministic
        expect(isDeterministicAssertion(type)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should correctly identify soft assertion type', () => {
    // Property: soft type should not be deterministic
    expect(isDeterministicAssertion('soft')).toBe(false);
  });

  /**
   * Full arbitration flow for deterministic assertions
   */
  it('should correctly arbitrate deterministic assertions', () => {
    const assertionArb = fc.record({
      id: fc.uuid(),
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      runId: fc.constant('run-1'),
      caseId: fc.constant('TC001'),
      type: deterministicTypeArb,
      description: fc.string({ minLength: 5, maxLength: 50 }),
      expected: fc.string({ minLength: 1, maxLength: 20 }),
      machineVerdict: verdictArb,
    }) as fc.Arbitrary<Assertion>;

    const reviewArb = fc.record({
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      caseId: fc.constant('TC001'),
      reviewVerdict: reviewVerdictArb,
      reasoning: fc.string({ minLength: 5, maxLength: 50 }),
    }) as fc.Arbitrary<AssertionReview>;

    fc.assert(
      fc.property(assertionArb, reviewArb, (assertion, review) => {
        // Ensure IDs match
        const matchedReview = { ...review, assertionId: assertion.assertionId };
        const result = arbitrateAssertion(assertion, matchedReview);

        // Property: result should follow arbitration rules
        if (matchedReview.reviewVerdict === 'agree') {
          expect(result.finalVerdict).toBe(assertion.machineVerdict);
        } else if (matchedReview.reviewVerdict === 'disagree') {
          expect(result.finalVerdict).toBe('fail');
        } else {
          expect(result.finalVerdict).toBe(assertion.machineVerdict);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Full arbitration flow for soft assertions
   */
  it('should correctly arbitrate soft assertions', () => {
    const assertionArb = fc.record({
      id: fc.uuid(),
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      runId: fc.constant('run-1'),
      caseId: fc.constant('TC001'),
      type: fc.constant('soft') as fc.Arbitrary<'soft'>,
      description: fc.string({ minLength: 5, maxLength: 50 }),
      expected: fc.string({ minLength: 1, maxLength: 20 }),
      agentVerdict: verdictArb,
    }) as fc.Arbitrary<Assertion>;

    const reviewArb = fc.record({
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      caseId: fc.constant('TC001'),
      reviewVerdict: reviewVerdictArb,
      reasoning: fc.string({ minLength: 5, maxLength: 50 }),
    }) as fc.Arbitrary<AssertionReview>;

    fc.assert(
      fc.property(assertionArb, reviewArb, (assertion, review) => {
        // Ensure IDs match
        const matchedReview = { ...review, assertionId: assertion.assertionId };
        const result = arbitrateAssertion(assertion, matchedReview);

        // Property: result should follow soft assertion rules
        if (matchedReview.reviewVerdict === 'agree') {
          expect(result.finalVerdict).toBe(assertion.agentVerdict);
        } else {
          // disagree or uncertain → fail
          expect(result.finalVerdict).toBe('fail');
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Summary statistics consistency
   */
  it('should generate consistent summary statistics', () => {
    const resultArb = fc.record({
      assertionId: fc.string({ minLength: 3, maxLength: 10 }),
      originalVerdict: verdictArb,
      reviewVerdict: reviewVerdictArb,
      finalVerdict: verdictArb,
      arbitrationReason: fc.string({ minLength: 5, maxLength: 50 }),
      conflictDetected: fc.boolean(),
    });

    fc.assert(
      fc.property(fc.array(resultArb, { minLength: 0, maxLength: 20 }), (results) => {
        const summary = generateArbitrationSummary(results);

        // Property: total should equal sum of passed + failed + errors
        expect(summary.total).toBe(summary.passed + summary.failed + summary.errors);

        // Property: total should equal results length
        expect(summary.total).toBe(results.length);

        // Property: conflicts should be <= total
        expect(summary.conflicts).toBeLessThanOrEqual(summary.total);

        // Property: agreement rate should be between 0 and 1
        expect(summary.agreementRate).toBeGreaterThanOrEqual(0);
        expect(summary.agreementRate).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});

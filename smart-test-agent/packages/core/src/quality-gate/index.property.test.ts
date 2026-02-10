/**
 * Property-Based Tests for Quality Gate
 * **Validates: Requirements 11.1, 11.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateRC, calculateAPR } from './metrics-calculator';
import type { Requirement, TestCase, Assertion } from '@smart-test-agent/shared';

/**
 * **Property 26: Requirements Coverage Calculation**
 * 
 * *For any* set of requirements and test cases, RC should equal
 * (covered requirements) / (total testable requirements).
 * 
 * **Validates: Requirements 11.1**
 */
describe('Property 26: Requirements Coverage Calculation', () => {
  // Arbitrary for generating requirement IDs
  const requirementIdArb = fc.stringMatching(/^REQ-[0-9]{3}$/);

  // Arbitrary for generating a requirement
  const requirementArb = (id: string, testable: boolean): Requirement => ({
    id,
    requirementId: id,
    runId: 'run-1',
    title: `Requirement ${id}`,
    description: `Description for ${id}`,
    priority: fc.sample(fc.constantFrom('P0', 'P1', 'P2') as fc.Arbitrary<'P0' | 'P1' | 'P2'>, 1)[0],
    testable,
    route: '/test',
    acceptanceCriteria: [],
    tags: [],
  });

  // Arbitrary for generating a test case
  const testCaseArb = (caseId: string, requirementId: string): TestCase => ({
    id: caseId,
    caseId,
    runId: 'run-1',
    requirementId,
    route: '/test',
    title: `Test Case ${caseId}`,
    precondition: 'None',
    steps: [],
    assertions: [],
  });

  it('RC = covered / total testable for any valid input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }), // total testable
        fc.integer({ min: 0, max: 20 }), // non-testable
        fc.float({ min: 0, max: 1, noNaN: true }), // coverage ratio
        (totalTestable, nonTestable, coverageRatio) => {
          // Generate requirements
          const testableReqs: Requirement[] = Array.from({ length: totalTestable }, (_, i) =>
            requirementArb(`REQ-${String(i).padStart(3, '0')}`, true)
          );
          const nonTestableReqs: Requirement[] = Array.from({ length: nonTestable }, (_, i) =>
            requirementArb(`REQ-${String(totalTestable + i).padStart(3, '0')}`, false)
          );
          const requirements = [...testableReqs, ...nonTestableReqs];

          // Generate test cases covering a portion of testable requirements
          const coveredCount = Math.floor(totalTestable * coverageRatio);
          const testCases: TestCase[] = testableReqs
            .slice(0, coveredCount)
            .map((req, i) => testCaseArb(`TC-${String(i).padStart(3, '0')}`, req.requirementId));

          // Calculate RC
          const result = calculateRC(requirements, testCases);

          // Verify
          if (totalTestable === 0) {
            expect(result.value).toBe(1);
          } else {
            const expectedRC = coveredCount / totalTestable;
            expect(result.value).toBeCloseTo(expectedRC, 10);
          }

          // Verify threshold check
          expect(result.threshold).toBe(0.85);
          expect(result.passed).toBe(result.value >= 0.85);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('RC is always between 0 and 1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 30 }), // testable flags
        fc.array(fc.integer({ min: 0, max: 29 }), { minLength: 0, maxLength: 30 }), // covered indices
        (testableFlags, coveredIndices) => {
          const requirements: Requirement[] = testableFlags.map((testable, i) =>
            requirementArb(`REQ-${String(i).padStart(3, '0')}`, testable)
          );

          const testableReqs = requirements.filter((r) => r.testable);
          const validIndices = coveredIndices.filter((i) => i < testableReqs.length);
          const uniqueIndices = [...new Set(validIndices)];

          const testCases: TestCase[] = uniqueIndices.map((idx, i) =>
            testCaseArb(`TC-${String(i).padStart(3, '0')}`, testableReqs[idx]?.requirementId || 'REQ-000')
          );

          const result = calculateRC(requirements, testCases);

          expect(result.value).toBeGreaterThanOrEqual(0);
          expect(result.value).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('RC = 1 when all testable requirements are covered', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // testable count
        fc.integer({ min: 0, max: 10 }), // non-testable count
        (testableCount, nonTestableCount) => {
          const testableReqs: Requirement[] = Array.from({ length: testableCount }, (_, i) =>
            requirementArb(`REQ-${String(i).padStart(3, '0')}`, true)
          );
          const nonTestableReqs: Requirement[] = Array.from({ length: nonTestableCount }, (_, i) =>
            requirementArb(`REQ-${String(testableCount + i).padStart(3, '0')}`, false)
          );
          const requirements = [...testableReqs, ...nonTestableReqs];

          // Cover all testable requirements
          const testCases: TestCase[] = testableReqs.map((req, i) =>
            testCaseArb(`TC-${String(i).padStart(3, '0')}`, req.requirementId)
          );

          const result = calculateRC(requirements, testCases);

          expect(result.value).toBe(1);
          expect(result.passed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('RC = 0 when no testable requirements are covered', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // testable count
        (testableCount) => {
          const requirements: Requirement[] = Array.from({ length: testableCount }, (_, i) =>
            requirementArb(`REQ-${String(i).padStart(3, '0')}`, true)
          );

          // No test cases
          const testCases: TestCase[] = [];

          const result = calculateRC(requirements, testCases);

          expect(result.value).toBe(0);
          expect(result.passed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Property 27: Assertion Pass Rate Calculation**
 * 
 * *For any* execution result, APR should equal
 * (passed deterministic assertions) / (total executed deterministic assertions).
 * 
 * **Validates: Requirements 11.2**
 */
describe('Property 27: Assertion Pass Rate Calculation', () => {
  // Arbitrary for generating an assertion
  const assertionArb = (
    id: string,
    type: 'element_visible' | 'text_content' | 'element_count' | 'navigation' | 'soft',
    verdict: 'pass' | 'fail' | 'error'
  ): Assertion => ({
    id,
    assertionId: id,
    runId: 'run-1',
    caseId: 'TC-001',
    type,
    description: `Assertion ${id}`,
    expected: 'expected value',
    finalVerdict: verdict,
  });

  const deterministicTypes = ['element_visible', 'text_content', 'element_count', 'navigation'] as const;
  const allTypes = [...deterministicTypes, 'soft'] as const;
  const verdicts = ['pass', 'fail', 'error'] as const;

  it('APR = passed / total deterministic for any valid input', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...allTypes),
            verdict: fc.constantFrom(...verdicts),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (assertionSpecs) => {
          const assertions: Assertion[] = assertionSpecs.map((spec, i) =>
            assertionArb(`A-${String(i).padStart(3, '0')}`, spec.type, spec.verdict)
          );

          const result = calculateAPR(assertions);

          // Calculate expected APR
          const deterministicAssertions = assertions.filter((a) => a.type !== 'soft');
          const passedCount = deterministicAssertions.filter((a) => a.finalVerdict === 'pass').length;

          if (deterministicAssertions.length === 0) {
            expect(result.value).toBe(1);
          } else {
            const expectedAPR = passedCount / deterministicAssertions.length;
            expect(result.value).toBeCloseTo(expectedAPR, 10);
          }

          // Verify threshold check
          expect(result.threshold).toBe(0.95);
          expect(result.passed).toBe(result.value >= 0.95);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('APR is always between 0 and 1', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...allTypes),
            verdict: fc.constantFrom(...verdicts),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        (assertionSpecs) => {
          const assertions: Assertion[] = assertionSpecs.map((spec, i) =>
            assertionArb(`A-${String(i).padStart(3, '0')}`, spec.type, spec.verdict)
          );

          const result = calculateAPR(assertions);

          expect(result.value).toBeGreaterThanOrEqual(0);
          expect(result.value).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('APR = 1 when all deterministic assertions pass', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // deterministic count
        fc.integer({ min: 0, max: 10 }), // soft count (any verdict)
        (deterministicCount, softCount) => {
          const deterministicAssertions: Assertion[] = Array.from({ length: deterministicCount }, (_, i) =>
            assertionArb(
              `A-${String(i).padStart(3, '0')}`,
              deterministicTypes[i % deterministicTypes.length],
              'pass'
            )
          );
          const softAssertions: Assertion[] = Array.from({ length: softCount }, (_, i) =>
            assertionArb(
              `A-${String(deterministicCount + i).padStart(3, '0')}`,
              'soft',
              verdicts[i % verdicts.length] // Any verdict for soft
            )
          );
          const assertions = [...deterministicAssertions, ...softAssertions];

          const result = calculateAPR(assertions);

          expect(result.value).toBe(1);
          expect(result.passed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('APR = 0 when all deterministic assertions fail', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // deterministic count
        (deterministicCount) => {
          const assertions: Assertion[] = Array.from({ length: deterministicCount }, (_, i) =>
            assertionArb(
              `A-${String(i).padStart(3, '0')}`,
              deterministicTypes[i % deterministicTypes.length],
              'fail'
            )
          );

          const result = calculateAPR(assertions);

          expect(result.value).toBe(0);
          expect(result.passed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('soft assertions do not affect APR', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // deterministic pass count
        fc.integer({ min: 0, max: 10 }), // deterministic fail count
        fc.integer({ min: 0, max: 20 }), // soft count
        fc.array(fc.constantFrom(...verdicts), { minLength: 0, maxLength: 20 }), // soft verdicts
        (passCount, failCount, softCount, softVerdicts) => {
          const passedAssertions: Assertion[] = Array.from({ length: passCount }, (_, i) =>
            assertionArb(`A-P-${i}`, deterministicTypes[i % deterministicTypes.length], 'pass')
          );
          const failedAssertions: Assertion[] = Array.from({ length: failCount }, (_, i) =>
            assertionArb(`A-F-${i}`, deterministicTypes[i % deterministicTypes.length], 'fail')
          );
          const softAssertions: Assertion[] = Array.from({ length: softCount }, (_, i) =>
            assertionArb(`A-S-${i}`, 'soft', softVerdicts[i % softVerdicts.length] || 'pass')
          );

          const assertions = [...passedAssertions, ...failedAssertions, ...softAssertions];
          const result = calculateAPR(assertions);

          // APR should only consider deterministic assertions
          const totalDeterministic = passCount + failCount;
          if (totalDeterministic === 0) {
            expect(result.value).toBe(1);
          } else {
            const expectedAPR = passCount / totalDeterministic;
            expect(result.value).toBeCloseTo(expectedAPR, 10);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

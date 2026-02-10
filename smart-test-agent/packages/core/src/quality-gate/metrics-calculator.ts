/**
 * Quality Gate Metrics Calculator
 * Calculates RC, APR, and FR metrics
 * @see Requirements 11.1, 11.2, 11.5
 */

import type {
  Requirement,
  TestCase,
  Assertion,
  TestRun,
  QualityMetric,
  QualityMetricName,
} from '@smart-test-agent/shared';

/**
 * Calculate Requirements Coverage (RC)
 * RC = covered_reqs / total_reqs (only testable=true)
 * @see Requirements 11.1
 */
export function calculateRC(
  requirements: Requirement[],
  testCases: TestCase[]
): QualityMetric {
  // Filter testable requirements
  const testableRequirements = requirements.filter((r) => r.testable);

  if (testableRequirements.length === 0) {
    return {
      name: 'RC',
      value: 1,
      threshold: 0.85,
      passed: true,
    };
  }

  // Get covered requirement IDs
  const coveredRequirementIds = new Set<string>();
  for (const tc of testCases) {
    coveredRequirementIds.add(tc.requirementId);
  }

  // Count covered testable requirements
  let coveredCount = 0;
  for (const req of testableRequirements) {
    if (coveredRequirementIds.has(req.id) || coveredRequirementIds.has(req.requirementId)) {
      coveredCount++;
    }
  }

  const value = coveredCount / testableRequirements.length;
  const threshold = 0.85;

  return {
    name: 'RC',
    value,
    threshold,
    passed: value >= threshold,
  };
}

/**
 * Calculate Assertion Pass Rate (APR)
 * APR = passed / executed (only deterministic assertions)
 * @see Requirements 11.2
 */
export function calculateAPR(assertions: Assertion[]): QualityMetric {
  // Filter deterministic assertions (non-soft)
  const deterministicAssertions = assertions.filter((a) => a.type !== 'soft');

  if (deterministicAssertions.length === 0) {
    return {
      name: 'APR',
      value: 1,
      threshold: 0.95,
      passed: true,
    };
  }

  // Count passed assertions
  const passedCount = deterministicAssertions.filter(
    (a) => a.finalVerdict === 'pass'
  ).length;

  const value = passedCount / deterministicAssertions.length;
  const threshold = 0.95;

  return {
    name: 'APR',
    value,
    threshold,
    passed: value >= threshold,
  };
}

/**
 * Calculate Flaky Rate (FR)
 * FR = flaky / automated
 * Requires ≥3 historical executions
 * @see Requirements 11.5
 */
export function calculateFR(runHistory: TestRun[]): QualityMetric | null {
  // Requires at least 3 runs
  if (runHistory.length < 3) {
    return null;
  }

  // Get all test case IDs across runs
  const testCaseResults = new Map<string, boolean[]>();

  for (const run of runHistory) {
    if (!run.testCases) continue;

    for (const tc of run.testCases) {
      const results = testCaseResults.get(tc.caseId) || [];
      const passed = tc.status === 'passed';
      results.push(passed);
      testCaseResults.set(tc.caseId, results);
    }
  }

  // Count flaky test cases (inconsistent results)
  let flakyCount = 0;
  let automatedCount = 0;

  for (const [, results] of testCaseResults) {
    if (results.length < 3) continue;

    automatedCount++;

    // Check if results are inconsistent
    const hasPass = results.some((r) => r);
    const hasFail = results.some((r) => !r);

    if (hasPass && hasFail) {
      flakyCount++;
    }
  }

  if (automatedCount === 0) {
    return null;
  }

  const value = flakyCount / automatedCount;
  const threshold = 0.05;

  return {
    name: 'FR',
    value,
    threshold,
    passed: value <= threshold,
  };
}

/**
 * Get detailed RC breakdown
 */
export interface RCBreakdown {
  totalTestable: number;
  covered: number;
  uncovered: string[];
  rate: number;
}

export function getRCBreakdown(
  requirements: Requirement[],
  testCases: TestCase[]
): RCBreakdown {
  const testableRequirements = requirements.filter((r) => r.testable);
  const coveredRequirementIds = new Set(testCases.map((tc) => tc.requirementId));

  const uncovered: string[] = [];
  let covered = 0;

  for (const req of testableRequirements) {
    if (coveredRequirementIds.has(req.id) || coveredRequirementIds.has(req.requirementId)) {
      covered++;
    } else {
      uncovered.push(req.requirementId);
    }
  }

  return {
    totalTestable: testableRequirements.length,
    covered,
    uncovered,
    rate: testableRequirements.length > 0 ? covered / testableRequirements.length : 1,
  };
}

/**
 * Get detailed APR breakdown
 */
export interface APRBreakdown {
  totalDeterministic: number;
  passed: number;
  failed: number;
  errors: number;
  rate: number;
}

export function getAPRBreakdown(assertions: Assertion[]): APRBreakdown {
  const deterministicAssertions = assertions.filter((a) => a.type !== 'soft');

  const passed = deterministicAssertions.filter((a) => a.finalVerdict === 'pass').length;
  const failed = deterministicAssertions.filter((a) => a.finalVerdict === 'fail').length;
  const errors = deterministicAssertions.filter((a) => a.finalVerdict === 'error').length;

  return {
    totalDeterministic: deterministicAssertions.length,
    passed,
    failed,
    errors,
    rate: deterministicAssertions.length > 0 ? passed / deterministicAssertions.length : 1,
  };
}

/**
 * Get flaky test cases
 */
export function getFlakyTestCases(runHistory: TestRun[]): string[] {
  if (runHistory.length < 3) {
    return [];
  }

  const testCaseResults = new Map<string, boolean[]>();

  for (const run of runHistory) {
    if (!run.testCases) continue;

    for (const tc of run.testCases) {
      const results = testCaseResults.get(tc.caseId) || [];
      results.push(tc.status === 'passed');
      testCaseResults.set(tc.caseId, results);
    }
  }

  const flakyIds: string[] = [];

  for (const [caseId, results] of testCaseResults) {
    if (results.length < 3) continue;

    const hasPass = results.some((r) => r);
    const hasFail = results.some((r) => !r);

    if (hasPass && hasFail) {
      flakyIds.push(caseId);
    }
  }

  return flakyIds;
}

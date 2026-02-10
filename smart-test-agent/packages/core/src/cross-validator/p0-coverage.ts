/**
 * P0 Coverage Checker
 * Verifies all P0 requirements have corresponding test cases
 * @see Requirements 5.4, 5.5
 */

import type {
  Requirement,
  TestCase,
  P0CoverageCheck,
} from '@smart-test-agent/shared';

/**
 * Check P0 requirements coverage
 * @see Requirements 5.4, 5.5
 */
export function checkP0Coverage(
  requirements: Requirement[],
  testCases: TestCase[]
): P0CoverageCheck {
  // Get all P0 requirements
  const p0Requirements = requirements.filter((r) => r.priority === 'P0' && r.testable);

  // Get all requirement IDs that have test cases
  const coveredRequirementIds = new Set(testCases.map((tc) => tc.requirementId));

  // Find missing P0 requirements
  const missingP0Ids: string[] = [];

  for (const req of p0Requirements) {
    if (!coveredRequirementIds.has(req.id) && !coveredRequirementIds.has(req.requirementId)) {
      missingP0Ids.push(req.requirementId);
    }
  }

  return {
    status: missingP0Ids.length === 0 ? 'pass' : 'fail',
    missingP0Ids,
  };
}

/**
 * Get P0 requirements
 */
export function getP0Requirements(requirements: Requirement[]): Requirement[] {
  return requirements.filter((r) => r.priority === 'P0');
}

/**
 * Get testable P0 requirements
 */
export function getTestableP0Requirements(requirements: Requirement[]): Requirement[] {
  return requirements.filter((r) => r.priority === 'P0' && r.testable);
}

/**
 * Get coverage details for P0 requirements
 */
export interface P0CoverageDetails {
  requirementId: string;
  title: string;
  covered: boolean;
  testCaseIds: string[];
}

/**
 * Get detailed P0 coverage information
 */
export function getP0CoverageDetails(
  requirements: Requirement[],
  testCases: TestCase[]
): P0CoverageDetails[] {
  const p0Requirements = getTestableP0Requirements(requirements);

  // Build map of requirement ID to test cases
  const testCasesByRequirement = new Map<string, string[]>();

  for (const tc of testCases) {
    const existing = testCasesByRequirement.get(tc.requirementId) || [];
    existing.push(tc.caseId);
    testCasesByRequirement.set(tc.requirementId, existing);
  }

  return p0Requirements.map((req) => {
    const testCaseIds = testCasesByRequirement.get(req.id) ||
                        testCasesByRequirement.get(req.requirementId) ||
                        [];

    return {
      requirementId: req.requirementId,
      title: req.title,
      covered: testCaseIds.length > 0,
      testCaseIds,
    };
  });
}

/**
 * Calculate P0 coverage rate
 */
export function calculateP0CoverageRate(
  requirements: Requirement[],
  testCases: TestCase[]
): number {
  const p0Requirements = getTestableP0Requirements(requirements);

  if (p0Requirements.length === 0) {
    return 1; // No P0 requirements means 100% coverage
  }

  const details = getP0CoverageDetails(requirements, testCases);
  const coveredCount = details.filter((d) => d.covered).length;

  return coveredCount / p0Requirements.length;
}

/**
 * Validate P0 coverage meets threshold
 */
export function validateP0Coverage(
  requirements: Requirement[],
  testCases: TestCase[],
  threshold: number = 1.0
): { valid: boolean; rate: number; message: string } {
  const rate = calculateP0CoverageRate(requirements, testCases);
  const valid = rate >= threshold;

  let message: string;
  if (valid) {
    message = `P0 coverage rate ${(rate * 100).toFixed(1)}% meets threshold ${(threshold * 100).toFixed(1)}%`;
  } else {
    const check = checkP0Coverage(requirements, testCases);
    message = `P0 coverage rate ${(rate * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(1)}%. Missing: ${check.missingP0Ids.join(', ')}`;
  }

  return { valid, rate, message };
}

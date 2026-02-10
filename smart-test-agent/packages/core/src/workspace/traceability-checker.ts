/**
 * Traceability Checker
 * Verifies traceability chain completeness
 * @see Requirements 14.4, 14.5
 */

import type {
  Requirement,
  TestCase,
  Assertion,
} from '@smart-test-agent/shared';

/**
 * Traceability chain link
 */
export interface TraceabilityLink {
  requirementId: string;
  caseId: string;
  assertionId: string;
  evidencePath?: string;
}

/**
 * Traceability check result
 */
export interface TraceabilityResult {
  /** Whether all chains are complete */
  complete: boolean;
  /** Complete chains */
  completeChains: TraceabilityLink[];
  /** Incomplete chains (missing evidence) */
  incompleteChains: TraceabilityLink[];
  /** Orphaned assertions (missing case or requirement) */
  orphanedAssertions: string[];
  /** Orphaned test cases (missing requirement) */
  orphanedTestCases: string[];
}

/**
 * Build traceability chains from test data
 * @see Requirements 14.4
 */
export function buildTraceabilityChains(
  requirements: Requirement[],
  testCases: TestCase[],
  assertions: Assertion[]
): TraceabilityLink[] {
  const chains: TraceabilityLink[] = [];

  // Build requirement ID set
  const requirementIds = new Set(requirements.map((r) => r.requirementId));

  // Build case ID to requirement ID map
  const caseToRequirement = new Map<string, string>();
  for (const tc of testCases) {
    caseToRequirement.set(tc.caseId, tc.requirementId);
  }

  // Build chains from assertions
  for (const assertion of assertions) {
    const requirementId = caseToRequirement.get(assertion.caseId);

    if (requirementId && requirementIds.has(requirementId)) {
      chains.push({
        requirementId,
        caseId: assertion.caseId,
        assertionId: assertion.assertionId,
        evidencePath: assertion.evidencePath,
      });
    }
  }

  return chains;
}

/**
 * Check traceability chain completeness
 * @see Requirements 14.4, 14.5
 */
export function checkTraceability(
  requirements: Requirement[],
  testCases: TestCase[],
  assertions: Assertion[]
): TraceabilityResult {
  const requirementIds = new Set(requirements.map((r) => r.requirementId));
  const caseIds = new Set(testCases.map((tc) => tc.caseId));
  const caseToRequirement = new Map<string, string>();

  for (const tc of testCases) {
    caseToRequirement.set(tc.caseId, tc.requirementId);
  }

  const completeChains: TraceabilityLink[] = [];
  const incompleteChains: TraceabilityLink[] = [];
  const orphanedAssertions: string[] = [];
  const orphanedTestCases: string[] = [];

  // Check test cases for orphans
  for (const tc of testCases) {
    if (!requirementIds.has(tc.requirementId)) {
      orphanedTestCases.push(tc.caseId);
    }
  }

  // Check assertions and build chains
  for (const assertion of assertions) {
    // Check if case exists
    if (!caseIds.has(assertion.caseId)) {
      orphanedAssertions.push(assertion.assertionId);
      continue;
    }

    const requirementId = caseToRequirement.get(assertion.caseId);

    // Check if requirement exists
    if (!requirementId || !requirementIds.has(requirementId)) {
      orphanedAssertions.push(assertion.assertionId);
      continue;
    }

    const link: TraceabilityLink = {
      requirementId,
      caseId: assertion.caseId,
      assertionId: assertion.assertionId,
      evidencePath: assertion.evidencePath,
    };

    // Check if evidence exists
    if (assertion.evidencePath) {
      completeChains.push(link);
    } else {
      incompleteChains.push(link);
    }
  }

  return {
    complete: incompleteChains.length === 0 && orphanedAssertions.length === 0,
    completeChains,
    incompleteChains,
    orphanedAssertions,
    orphanedTestCases,
  };
}

/**
 * Get assertions that should be excluded from gate calculation
 * @see Requirements 14.5
 */
export function getExcludedAssertions(
  traceabilityResult: TraceabilityResult
): Set<string> {
  const excluded = new Set<string>();

  // Exclude orphaned assertions
  for (const assertionId of traceabilityResult.orphanedAssertions) {
    excluded.add(assertionId);
  }

  // Exclude assertions with incomplete chains (missing evidence)
  for (const chain of traceabilityResult.incompleteChains) {
    excluded.add(chain.assertionId);
  }

  return excluded;
}

/**
 * Filter assertions to only include those with complete traceability
 */
export function filterTraceable(
  assertions: Assertion[],
  traceabilityResult: TraceabilityResult
): Assertion[] {
  const excluded = getExcludedAssertions(traceabilityResult);
  return assertions.filter((a) => !excluded.has(a.assertionId));
}

/**
 * Get traceability summary
 */
export interface TraceabilitySummary {
  totalAssertions: number;
  completeChains: number;
  incompleteChains: number;
  orphanedAssertions: number;
  orphanedTestCases: number;
  completenessRate: number;
}

export function getTraceabilitySummary(
  result: TraceabilityResult,
  totalAssertions: number
): TraceabilitySummary {
  const completeCount = result.completeChains.length;
  const total = completeCount + result.incompleteChains.length + result.orphanedAssertions.length;

  return {
    totalAssertions,
    completeChains: completeCount,
    incompleteChains: result.incompleteChains.length,
    orphanedAssertions: result.orphanedAssertions.length,
    orphanedTestCases: result.orphanedTestCases.length,
    completenessRate: total > 0 ? completeCount / total : 1,
  };
}

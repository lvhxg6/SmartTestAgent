/**
 * Cross-Validation Arbitrator
 * Implements arbitration rules for machine/agent verdicts vs Codex review
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import type {
  Assertion,
  AssertionReview,
  Verdict,
  ReviewVerdict,
  AssertionType,
} from '@smart-test-agent/shared';

/**
 * Arbitration result
 */
export interface ArbitrationResult {
  assertionId: string;
  originalVerdict: Verdict;
  reviewVerdict: ReviewVerdict;
  finalVerdict: Verdict;
  arbitrationReason: string;
  conflictDetected: boolean;
}

/**
 * Check if assertion type is deterministic (machine verdict)
 * @see Requirements 9.1, 9.2, 9.3
 */
export function isDeterministicAssertion(type: AssertionType): boolean {
  return type !== 'soft';
}

/**
 * Arbitrate a deterministic assertion (machine verdict)
 * Rules:
 * - machine_verdict + agree → maintain original verdict
 * - machine_verdict + disagree → failed
 * - machine_verdict + uncertain → maintain original verdict
 * @see Requirements 9.1, 9.2, 9.3
 */
export function arbitrateDeterministicAssertion(
  machineVerdict: Verdict,
  reviewVerdict: ReviewVerdict
): { finalVerdict: Verdict; reason: string; conflictDetected: boolean } {
  switch (reviewVerdict) {
    case 'agree':
      return {
        finalVerdict: machineVerdict,
        reason: 'Codex agrees with machine verdict',
        conflictDetected: false,
      };

    case 'disagree':
      return {
        finalVerdict: 'fail',
        reason: 'Codex disagrees with machine verdict - marking as failed',
        conflictDetected: true,
      };

    case 'uncertain':
      return {
        finalVerdict: machineVerdict,
        reason: 'Codex uncertain - maintaining machine verdict',
        conflictDetected: false,
      };

    default:
      return {
        finalVerdict: machineVerdict,
        reason: 'Unknown review verdict - maintaining machine verdict',
        conflictDetected: false,
      };
  }
}

/**
 * Arbitrate a soft assertion (agent verdict)
 * Rules:
 * - agent_verdict + agree → maintain original verdict
 * - agent_verdict + disagree → failed
 * - agent_verdict + uncertain → failed
 * @see Requirements 9.4, 9.5
 */
export function arbitrateSoftAssertion(
  agentVerdict: Verdict,
  reviewVerdict: ReviewVerdict
): { finalVerdict: Verdict; reason: string; conflictDetected: boolean } {
  switch (reviewVerdict) {
    case 'agree':
      return {
        finalVerdict: agentVerdict,
        reason: 'Codex agrees with agent verdict',
        conflictDetected: false,
      };

    case 'disagree':
      return {
        finalVerdict: 'fail',
        reason: 'Codex disagrees with agent verdict - marking as failed',
        conflictDetected: true,
      };

    case 'uncertain':
      return {
        finalVerdict: 'fail',
        reason: 'Codex uncertain on soft assertion - marking as failed for safety',
        conflictDetected: true,
      };

    default:
      return {
        finalVerdict: 'fail',
        reason: 'Unknown review verdict on soft assertion - marking as failed',
        conflictDetected: true,
      };
  }
}

/**
 * Arbitrate a single assertion with its review
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function arbitrateAssertion(
  assertion: Assertion,
  review: AssertionReview
): ArbitrationResult {
  const isDeterministic = isDeterministicAssertion(assertion.type);

  // Get the original verdict
  const originalVerdict: Verdict = isDeterministic
    ? assertion.machineVerdict || 'error'
    : assertion.agentVerdict || 'error';

  // Apply arbitration rules
  const { finalVerdict, reason, conflictDetected } = isDeterministic
    ? arbitrateDeterministicAssertion(originalVerdict, review.reviewVerdict)
    : arbitrateSoftAssertion(originalVerdict, review.reviewVerdict);

  return {
    assertionId: assertion.assertionId,
    originalVerdict,
    reviewVerdict: review.reviewVerdict,
    finalVerdict,
    arbitrationReason: reason,
    conflictDetected,
  };
}

/**
 * Arbitrate multiple assertions with their reviews
 */
export function arbitrateAssertions(
  assertions: Assertion[],
  reviews: AssertionReview[]
): ArbitrationResult[] {
  const reviewMap = new Map(reviews.map((r) => [r.assertionId, r]));
  const results: ArbitrationResult[] = [];

  for (const assertion of assertions) {
    const review = reviewMap.get(assertion.assertionId);

    if (review) {
      results.push(arbitrateAssertion(assertion, review));
    } else {
      // No review found - maintain original verdict
      const isDeterministic = isDeterministicAssertion(assertion.type);
      const originalVerdict: Verdict = isDeterministic
        ? assertion.machineVerdict || 'error'
        : assertion.agentVerdict || 'error';

      results.push({
        assertionId: assertion.assertionId,
        originalVerdict,
        reviewVerdict: 'uncertain',
        finalVerdict: originalVerdict,
        arbitrationReason: 'No Codex review found - maintaining original verdict',
        conflictDetected: false,
      });
    }
  }

  return results;
}

/**
 * Apply arbitration results to assertions
 */
export function applyArbitrationResults(
  assertions: Assertion[],
  results: ArbitrationResult[]
): Assertion[] {
  const resultMap = new Map(results.map((r) => [r.assertionId, r]));

  return assertions.map((assertion) => {
    const result = resultMap.get(assertion.assertionId);

    if (result) {
      return {
        ...assertion,
        finalVerdict: result.finalVerdict,
      };
    }

    return assertion;
  });
}

/**
 * Count conflicts in arbitration results
 */
export function countConflicts(results: ArbitrationResult[]): number {
  return results.filter((r) => r.conflictDetected).length;
}

/**
 * Get failed assertions after arbitration
 */
export function getFailedAssertions(results: ArbitrationResult[]): ArbitrationResult[] {
  return results.filter((r) => r.finalVerdict === 'fail');
}

/**
 * Get passed assertions after arbitration
 */
export function getPassedAssertions(results: ArbitrationResult[]): ArbitrationResult[] {
  return results.filter((r) => r.finalVerdict === 'pass');
}

/**
 * Summary of arbitration results
 */
export interface ArbitrationSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  conflicts: number;
  agreementRate: number;
}

/**
 * Generate arbitration summary
 */
export function generateArbitrationSummary(results: ArbitrationResult[]): ArbitrationSummary {
  const total = results.length;
  const passed = results.filter((r) => r.finalVerdict === 'pass').length;
  const failed = results.filter((r) => r.finalVerdict === 'fail').length;
  const errors = results.filter((r) => r.finalVerdict === 'error').length;
  const conflicts = countConflicts(results);
  const agreementRate = total > 0 ? (total - conflicts) / total : 1;

  return {
    total,
    passed,
    failed,
    errors,
    conflicts,
    agreementRate,
  };
}

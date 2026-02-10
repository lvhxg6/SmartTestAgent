/**
 * Codex Review Results Parser
 * Parses codex-review-results.json output
 * @see Requirements 8.2, 8.3, 8.4
 */

import type {
  AssertionReview,
  CodexExecutionReviewResults,
  ReviewVerdict,
  ConflictType,
} from '@smart-test-agent/shared';

/**
 * Raw Codex review result from JSON file
 */
export interface RawCodexReviewResult {
  assertionId: string;
  caseId: string;
  reviewVerdict: string;
  reasoning: string;
  conflictType?: string;
}

/**
 * Raw Codex review results file structure
 */
export interface RawCodexReviewFile {
  reviews: RawCodexReviewResult[];
  falsePositives?: string[];
  falseNegatives?: string[];
}

/**
 * Parse review verdict string to typed enum
 */
export function parseReviewVerdict(verdict: string): ReviewVerdict {
  const normalized = verdict.toLowerCase().trim();
  
  switch (normalized) {
    case 'agree':
      return 'agree';
    case 'disagree':
      return 'disagree';
    case 'uncertain':
      return 'uncertain';
    default:
      // Default to uncertain for unknown values
      return 'uncertain';
  }
}

/**
 * Parse conflict type string to typed enum
 */
export function parseConflictType(conflictType: string | undefined): ConflictType | undefined {
  if (!conflictType) {
    return undefined;
  }

  const normalized = conflictType.toLowerCase().trim().replace(/-/g, '_');

  switch (normalized) {
    case 'fact_conflict':
      return 'fact_conflict';
    case 'evidence_missing':
      return 'evidence_missing';
    case 'threshold_conflict':
      return 'threshold_conflict';
    default:
      return undefined;
  }
}

/**
 * Parse a single raw review result to typed AssertionReview
 */
export function parseAssertionReview(raw: RawCodexReviewResult): AssertionReview {
  return {
    assertionId: raw.assertionId,
    caseId: raw.caseId,
    reviewVerdict: parseReviewVerdict(raw.reviewVerdict),
    reasoning: raw.reasoning,
    conflictType: parseConflictType(raw.conflictType),
  };
}

/**
 * Parse raw Codex review file to typed CodexExecutionReviewResults
 * @see Requirements 8.2, 8.3, 8.4
 */
export function parseCodexReviewResults(raw: RawCodexReviewFile): CodexExecutionReviewResults {
  return {
    reviews: raw.reviews.map(parseAssertionReview),
    falsePositives: raw.falsePositives || [],
    falseNegatives: raw.falseNegatives || [],
  };
}

/**
 * Validate raw Codex review file structure
 */
export function validateCodexReviewFile(data: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return { valid: false, errors };
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.reviews)) {
    errors.push('reviews must be an array');
  } else {
    obj.reviews.forEach((review, index) => {
      if (!review || typeof review !== 'object') {
        errors.push(`reviews[${index}] must be an object`);
        return;
      }

      const r = review as Record<string, unknown>;

      if (typeof r.assertionId !== 'string') {
        errors.push(`reviews[${index}].assertionId must be a string`);
      }
      if (typeof r.caseId !== 'string') {
        errors.push(`reviews[${index}].caseId must be a string`);
      }
      if (typeof r.reviewVerdict !== 'string') {
        errors.push(`reviews[${index}].reviewVerdict must be a string`);
      }
      if (typeof r.reasoning !== 'string') {
        errors.push(`reviews[${index}].reasoning must be a string`);
      }
    });
  }

  if (obj.falsePositives !== undefined && !Array.isArray(obj.falsePositives)) {
    errors.push('falsePositives must be an array if present');
  }

  if (obj.falseNegatives !== undefined && !Array.isArray(obj.falseNegatives)) {
    errors.push('falseNegatives must be an array if present');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get review by assertion ID
 */
export function getReviewByAssertionId(
  results: CodexExecutionReviewResults,
  assertionId: string
): AssertionReview | undefined {
  return results.reviews.find((r) => r.assertionId === assertionId);
}

/**
 * Get reviews by case ID
 */
export function getReviewsByCaseId(
  results: CodexExecutionReviewResults,
  caseId: string
): AssertionReview[] {
  return results.reviews.filter((r) => r.caseId === caseId);
}

/**
 * Count reviews by verdict
 */
export function countReviewsByVerdict(
  results: CodexExecutionReviewResults
): Record<ReviewVerdict, number> {
  const counts: Record<ReviewVerdict, number> = {
    agree: 0,
    disagree: 0,
    uncertain: 0,
  };

  for (const review of results.reviews) {
    counts[review.reviewVerdict]++;
  }

  return counts;
}

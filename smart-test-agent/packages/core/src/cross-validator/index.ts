/**
 * Cross-Validator Module
 * Implements cross-validation and arbitration logic
 * @see Requirements 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 5.4, 5.5
 */

// Codex Review Parser
export {
  type RawCodexReviewResult,
  type RawCodexReviewFile,
  parseReviewVerdict,
  parseConflictType,
  parseAssertionReview,
  parseCodexReviewResults,
  validateCodexReviewFile,
  getReviewByAssertionId,
  getReviewsByCaseId,
  countReviewsByVerdict,
} from './codex-review-parser.js';

// Arbitrator
export {
  type ArbitrationResult,
  type ArbitrationSummary,
  isDeterministicAssertion,
  arbitrateDeterministicAssertion,
  arbitrateSoftAssertion,
  arbitrateAssertion,
  arbitrateAssertions,
  applyArbitrationResults,
  countConflicts,
  getFailedAssertions,
  getPassedAssertions,
  generateArbitrationSummary,
} from './arbitrator.js';

// P0 Coverage
export {
  type P0CoverageDetails,
  checkP0Coverage,
  getP0Requirements,
  getTestableP0Requirements,
  getP0CoverageDetails,
  calculateP0CoverageRate,
  validateP0Coverage,
} from './p0-coverage.js';

import type {
  Assertion,
  Requirement,
  TestCase,
  CodexExecutionReviewResults,
  P0CoverageCheck,
} from '@smart-test-agent/shared';
import { parseCodexReviewResults, type RawCodexReviewFile } from './codex-review-parser.js';
import {
  arbitrateAssertions,
  applyArbitrationResults,
  generateArbitrationSummary,
  type ArbitrationResult,
  type ArbitrationSummary,
} from './arbitrator.js';
import { checkP0Coverage, validateP0Coverage } from './p0-coverage.js';

/**
 * Cross-validation result
 */
export interface CrossValidationResult {
  arbitrationResults: ArbitrationResult[];
  arbitrationSummary: ArbitrationSummary;
  updatedAssertions: Assertion[];
  p0CoverageCheck: P0CoverageCheck;
}

/**
 * Cross-Validator class
 * Orchestrates the cross-validation process
 */
export class CrossValidator {
  /**
   * Perform cross-validation on assertions with Codex review results
   * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5
   */
  crossValidate(
    assertions: Assertion[],
    rawReviewResults: RawCodexReviewFile,
    requirements: Requirement[],
    testCases: TestCase[]
  ): CrossValidationResult {
    // Parse Codex review results
    const reviewResults = parseCodexReviewResults(rawReviewResults);

    // Perform arbitration
    const arbitrationResults = arbitrateAssertions(assertions, reviewResults.reviews);

    // Generate summary
    const arbitrationSummary = generateArbitrationSummary(arbitrationResults);

    // Apply results to assertions
    const updatedAssertions = applyArbitrationResults(assertions, arbitrationResults);

    // Check P0 coverage
    const p0CoverageCheck = checkP0Coverage(requirements, testCases);

    return {
      arbitrationResults,
      arbitrationSummary,
      updatedAssertions,
      p0CoverageCheck,
    };
  }

  /**
   * Validate P0 coverage
   * @see Requirements 5.4, 5.5
   */
  validateP0Coverage(
    requirements: Requirement[],
    testCases: TestCase[],
    threshold: number = 1.0
  ): { valid: boolean; rate: number; message: string } {
    return validateP0Coverage(requirements, testCases, threshold);
  }

  /**
   * Check if cross-validation passed
   */
  isPassed(result: CrossValidationResult): boolean {
    // P0 coverage must pass
    if (result.p0CoverageCheck.status !== 'pass') {
      return false;
    }

    // No conflicts should be detected (or handle based on policy)
    // For now, we allow conflicts but track them
    return true;
  }
}

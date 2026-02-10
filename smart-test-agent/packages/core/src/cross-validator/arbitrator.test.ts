/**
 * Unit tests for Arbitrator
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { describe, it, expect } from 'vitest';
import {
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
import type { Assertion, AssertionReview } from '@smart-test-agent/shared';

describe('Arbitrator', () => {
  describe('isDeterministicAssertion', () => {
    it('should return true for element_visible', () => {
      expect(isDeterministicAssertion('element_visible')).toBe(true);
    });

    it('should return true for text_content', () => {
      expect(isDeterministicAssertion('text_content')).toBe(true);
    });

    it('should return true for element_count', () => {
      expect(isDeterministicAssertion('element_count')).toBe(true);
    });

    it('should return true for navigation', () => {
      expect(isDeterministicAssertion('navigation')).toBe(true);
    });

    it('should return false for soft', () => {
      expect(isDeterministicAssertion('soft')).toBe(false);
    });
  });

  describe('arbitrateDeterministicAssertion', () => {
    it('should maintain verdict when Codex agrees', () => {
      const result = arbitrateDeterministicAssertion('pass', 'agree');
      expect(result.finalVerdict).toBe('pass');
      expect(result.conflictDetected).toBe(false);
    });

    it('should maintain fail verdict when Codex agrees', () => {
      const result = arbitrateDeterministicAssertion('fail', 'agree');
      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(false);
    });

    it('should mark as failed when Codex disagrees', () => {
      const result = arbitrateDeterministicAssertion('pass', 'disagree');
      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(true);
    });

    it('should maintain verdict when Codex is uncertain', () => {
      const result = arbitrateDeterministicAssertion('pass', 'uncertain');
      expect(result.finalVerdict).toBe('pass');
      expect(result.conflictDetected).toBe(false);
    });

    it('should maintain fail verdict when Codex is uncertain', () => {
      const result = arbitrateDeterministicAssertion('fail', 'uncertain');
      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(false);
    });
  });

  describe('arbitrateSoftAssertion', () => {
    it('should maintain verdict when Codex agrees', () => {
      const result = arbitrateSoftAssertion('pass', 'agree');
      expect(result.finalVerdict).toBe('pass');
      expect(result.conflictDetected).toBe(false);
    });

    it('should mark as failed when Codex disagrees', () => {
      const result = arbitrateSoftAssertion('pass', 'disagree');
      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(true);
    });

    it('should mark as failed when Codex is uncertain (soft assertion)', () => {
      const result = arbitrateSoftAssertion('pass', 'uncertain');
      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(true);
    });
  });

  describe('arbitrateAssertion', () => {
    const createAssertion = (type: 'element_visible' | 'soft', verdict: 'pass' | 'fail'): Assertion => ({
      id: 'a-1',
      assertionId: 'A001',
      runId: 'run-1',
      caseId: 'TC001',
      type,
      description: 'Test assertion',
      expected: 'expected',
      machineVerdict: type !== 'soft' ? verdict : undefined,
      agentVerdict: type === 'soft' ? verdict : undefined,
    });

    const createReview = (verdict: 'agree' | 'disagree' | 'uncertain'): AssertionReview => ({
      assertionId: 'A001',
      caseId: 'TC001',
      reviewVerdict: verdict,
      reasoning: 'Test reasoning',
    });

    it('should arbitrate deterministic assertion with agree', () => {
      const assertion = createAssertion('element_visible', 'pass');
      const review = createReview('agree');

      const result = arbitrateAssertion(assertion, review);

      expect(result.finalVerdict).toBe('pass');
      expect(result.conflictDetected).toBe(false);
    });

    it('should arbitrate deterministic assertion with disagree', () => {
      const assertion = createAssertion('element_visible', 'pass');
      const review = createReview('disagree');

      const result = arbitrateAssertion(assertion, review);

      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(true);
    });

    it('should arbitrate soft assertion with agree', () => {
      const assertion = createAssertion('soft', 'pass');
      const review = createReview('agree');

      const result = arbitrateAssertion(assertion, review);

      expect(result.finalVerdict).toBe('pass');
      expect(result.conflictDetected).toBe(false);
    });

    it('should arbitrate soft assertion with uncertain', () => {
      const assertion = createAssertion('soft', 'pass');
      const review = createReview('uncertain');

      const result = arbitrateAssertion(assertion, review);

      expect(result.finalVerdict).toBe('fail');
      expect(result.conflictDetected).toBe(true);
    });
  });

  describe('arbitrateAssertions', () => {
    const assertions: Assertion[] = [
      {
        id: 'a-1',
        assertionId: 'A001',
        runId: 'run-1',
        caseId: 'TC001',
        type: 'element_visible',
        description: 'Test 1',
        expected: 'expected',
        machineVerdict: 'pass',
      },
      {
        id: 'a-2',
        assertionId: 'A002',
        runId: 'run-1',
        caseId: 'TC001',
        type: 'soft',
        description: 'Test 2',
        expected: 'expected',
        agentVerdict: 'pass',
      },
    ];

    const reviews: AssertionReview[] = [
      { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
      { assertionId: 'A002', caseId: 'TC001', reviewVerdict: 'disagree', reasoning: 'Wrong' },
    ];

    it('should arbitrate multiple assertions', () => {
      const results = arbitrateAssertions(assertions, reviews);

      expect(results).toHaveLength(2);
      expect(results[0].finalVerdict).toBe('pass');
      expect(results[1].finalVerdict).toBe('fail');
    });

    it('should handle missing reviews', () => {
      const results = arbitrateAssertions(assertions, [reviews[0]]);

      expect(results).toHaveLength(2);
      expect(results[0].finalVerdict).toBe('pass');
      expect(results[1].finalVerdict).toBe('pass'); // No review, maintain original
      expect(results[1].arbitrationReason).toContain('No Codex review found');
    });
  });

  describe('applyArbitrationResults', () => {
    it('should apply results to assertions', () => {
      const assertions: Assertion[] = [
        {
          id: 'a-1',
          assertionId: 'A001',
          runId: 'run-1',
          caseId: 'TC001',
          type: 'element_visible',
          description: 'Test',
          expected: 'expected',
          machineVerdict: 'pass',
        },
      ];

      const results = [
        {
          assertionId: 'A001',
          originalVerdict: 'pass' as const,
          reviewVerdict: 'disagree' as const,
          finalVerdict: 'fail' as const,
          arbitrationReason: 'Codex disagrees',
          conflictDetected: true,
        },
      ];

      const updated = applyArbitrationResults(assertions, results);

      expect(updated[0].finalVerdict).toBe('fail');
    });
  });

  describe('countConflicts', () => {
    it('should count conflicts', () => {
      const results = [
        { assertionId: 'A001', originalVerdict: 'pass' as const, reviewVerdict: 'agree' as const, finalVerdict: 'pass' as const, arbitrationReason: '', conflictDetected: false },
        { assertionId: 'A002', originalVerdict: 'pass' as const, reviewVerdict: 'disagree' as const, finalVerdict: 'fail' as const, arbitrationReason: '', conflictDetected: true },
        { assertionId: 'A003', originalVerdict: 'pass' as const, reviewVerdict: 'disagree' as const, finalVerdict: 'fail' as const, arbitrationReason: '', conflictDetected: true },
      ];

      expect(countConflicts(results)).toBe(2);
    });
  });

  describe('getFailedAssertions', () => {
    it('should get failed assertions', () => {
      const results = [
        { assertionId: 'A001', originalVerdict: 'pass' as const, reviewVerdict: 'agree' as const, finalVerdict: 'pass' as const, arbitrationReason: '', conflictDetected: false },
        { assertionId: 'A002', originalVerdict: 'pass' as const, reviewVerdict: 'disagree' as const, finalVerdict: 'fail' as const, arbitrationReason: '', conflictDetected: true },
      ];

      const failed = getFailedAssertions(results);

      expect(failed).toHaveLength(1);
      expect(failed[0].assertionId).toBe('A002');
    });
  });

  describe('getPassedAssertions', () => {
    it('should get passed assertions', () => {
      const results = [
        { assertionId: 'A001', originalVerdict: 'pass' as const, reviewVerdict: 'agree' as const, finalVerdict: 'pass' as const, arbitrationReason: '', conflictDetected: false },
        { assertionId: 'A002', originalVerdict: 'pass' as const, reviewVerdict: 'disagree' as const, finalVerdict: 'fail' as const, arbitrationReason: '', conflictDetected: true },
      ];

      const passed = getPassedAssertions(results);

      expect(passed).toHaveLength(1);
      expect(passed[0].assertionId).toBe('A001');
    });
  });

  describe('generateArbitrationSummary', () => {
    it('should generate summary', () => {
      const results = [
        { assertionId: 'A001', originalVerdict: 'pass' as const, reviewVerdict: 'agree' as const, finalVerdict: 'pass' as const, arbitrationReason: '', conflictDetected: false },
        { assertionId: 'A002', originalVerdict: 'pass' as const, reviewVerdict: 'agree' as const, finalVerdict: 'pass' as const, arbitrationReason: '', conflictDetected: false },
        { assertionId: 'A003', originalVerdict: 'pass' as const, reviewVerdict: 'disagree' as const, finalVerdict: 'fail' as const, arbitrationReason: '', conflictDetected: true },
        { assertionId: 'A004', originalVerdict: 'error' as const, reviewVerdict: 'uncertain' as const, finalVerdict: 'error' as const, arbitrationReason: '', conflictDetected: false },
      ];

      const summary = generateArbitrationSummary(results);

      expect(summary.total).toBe(4);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.errors).toBe(1);
      expect(summary.conflicts).toBe(1);
      expect(summary.agreementRate).toBe(0.75);
    });

    it('should handle empty results', () => {
      const summary = generateArbitrationSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.agreementRate).toBe(1);
    });
  });
});

/**
 * Unit tests for Codex Review Parser
 * @see Requirements 8.2, 8.3, 8.4
 */

import { describe, it, expect } from 'vitest';
import {
  parseReviewVerdict,
  parseConflictType,
  parseAssertionReview,
  parseCodexReviewResults,
  validateCodexReviewFile,
  getReviewByAssertionId,
  getReviewsByCaseId,
  countReviewsByVerdict,
  type RawCodexReviewFile,
} from './codex-review-parser.js';

describe('Codex Review Parser', () => {
  describe('parseReviewVerdict', () => {
    it('should parse "agree" verdict', () => {
      expect(parseReviewVerdict('agree')).toBe('agree');
      expect(parseReviewVerdict('AGREE')).toBe('agree');
      expect(parseReviewVerdict(' Agree ')).toBe('agree');
    });

    it('should parse "disagree" verdict', () => {
      expect(parseReviewVerdict('disagree')).toBe('disagree');
      expect(parseReviewVerdict('DISAGREE')).toBe('disagree');
    });

    it('should parse "uncertain" verdict', () => {
      expect(parseReviewVerdict('uncertain')).toBe('uncertain');
      expect(parseReviewVerdict('UNCERTAIN')).toBe('uncertain');
    });

    it('should default to "uncertain" for unknown values', () => {
      expect(parseReviewVerdict('unknown')).toBe('uncertain');
      expect(parseReviewVerdict('')).toBe('uncertain');
      expect(parseReviewVerdict('maybe')).toBe('uncertain');
    });
  });

  describe('parseConflictType', () => {
    it('should parse "fact_conflict"', () => {
      expect(parseConflictType('fact_conflict')).toBe('fact_conflict');
      expect(parseConflictType('fact-conflict')).toBe('fact_conflict');
      expect(parseConflictType('FACT_CONFLICT')).toBe('fact_conflict');
    });

    it('should parse "evidence_missing"', () => {
      expect(parseConflictType('evidence_missing')).toBe('evidence_missing');
      expect(parseConflictType('evidence-missing')).toBe('evidence_missing');
    });

    it('should parse "threshold_conflict"', () => {
      expect(parseConflictType('threshold_conflict')).toBe('threshold_conflict');
      expect(parseConflictType('threshold-conflict')).toBe('threshold_conflict');
    });

    it('should return undefined for unknown values', () => {
      expect(parseConflictType('unknown')).toBeUndefined();
      expect(parseConflictType('')).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(parseConflictType(undefined)).toBeUndefined();
    });
  });

  describe('parseAssertionReview', () => {
    it('should parse a complete review', () => {
      const raw = {
        assertionId: 'A001',
        caseId: 'TC001',
        reviewVerdict: 'agree',
        reasoning: 'The assertion is correct',
        conflictType: 'fact_conflict',
      };

      const result = parseAssertionReview(raw);

      expect(result.assertionId).toBe('A001');
      expect(result.caseId).toBe('TC001');
      expect(result.reviewVerdict).toBe('agree');
      expect(result.reasoning).toBe('The assertion is correct');
      expect(result.conflictType).toBe('fact_conflict');
    });

    it('should handle missing conflict type', () => {
      const raw = {
        assertionId: 'A001',
        caseId: 'TC001',
        reviewVerdict: 'agree',
        reasoning: 'OK',
      };

      const result = parseAssertionReview(raw);

      expect(result.conflictType).toBeUndefined();
    });
  });

  describe('parseCodexReviewResults', () => {
    it('should parse complete review results', () => {
      const raw: RawCodexReviewFile = {
        reviews: [
          { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
          { assertionId: 'A002', caseId: 'TC001', reviewVerdict: 'disagree', reasoning: 'Wrong', conflictType: 'fact_conflict' },
        ],
        falsePositives: ['A003'],
        falseNegatives: ['A004'],
      };

      const result = parseCodexReviewResults(raw);

      expect(result.reviews).toHaveLength(2);
      expect(result.reviews[0].reviewVerdict).toBe('agree');
      expect(result.reviews[1].reviewVerdict).toBe('disagree');
      expect(result.reviews[1].conflictType).toBe('fact_conflict');
      expect(result.falsePositives).toEqual(['A003']);
      expect(result.falseNegatives).toEqual(['A004']);
    });

    it('should handle missing optional fields', () => {
      const raw: RawCodexReviewFile = {
        reviews: [
          { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
        ],
      };

      const result = parseCodexReviewResults(raw);

      expect(result.falsePositives).toEqual([]);
      expect(result.falseNegatives).toEqual([]);
    });
  });

  describe('validateCodexReviewFile', () => {
    it('should validate a correct file', () => {
      const data = {
        reviews: [
          { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
        ],
      };

      const result = validateCodexReviewFile(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing reviews array', () => {
      const data = {};

      const result = validateCodexReviewFile(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('reviews must be an array');
    });

    it('should detect invalid review objects', () => {
      const data = {
        reviews: [
          { assertionId: 123, caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
        ],
      };

      const result = validateCodexReviewFile(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('assertionId'))).toBe(true);
    });

    it('should detect missing required fields', () => {
      const data = {
        reviews: [
          { assertionId: 'A001' },
        ],
      };

      const result = validateCodexReviewFile(data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate optional arrays', () => {
      const data = {
        reviews: [],
        falsePositives: 'not-an-array',
      };

      const result = validateCodexReviewFile(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('falsePositives must be an array if present');
    });

    it('should reject non-object data', () => {
      const result = validateCodexReviewFile(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Data must be an object');
    });
  });

  describe('getReviewByAssertionId', () => {
    const results = parseCodexReviewResults({
      reviews: [
        { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
        { assertionId: 'A002', caseId: 'TC002', reviewVerdict: 'disagree', reasoning: 'Wrong' },
      ],
    });

    it('should find review by assertion ID', () => {
      const review = getReviewByAssertionId(results, 'A001');

      expect(review).toBeDefined();
      expect(review?.assertionId).toBe('A001');
    });

    it('should return undefined for non-existent ID', () => {
      const review = getReviewByAssertionId(results, 'A999');

      expect(review).toBeUndefined();
    });
  });

  describe('getReviewsByCaseId', () => {
    const results = parseCodexReviewResults({
      reviews: [
        { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
        { assertionId: 'A002', caseId: 'TC001', reviewVerdict: 'disagree', reasoning: 'Wrong' },
        { assertionId: 'A003', caseId: 'TC002', reviewVerdict: 'agree', reasoning: 'OK' },
      ],
    });

    it('should find all reviews for a case', () => {
      const reviews = getReviewsByCaseId(results, 'TC001');

      expect(reviews).toHaveLength(2);
      expect(reviews.every((r) => r.caseId === 'TC001')).toBe(true);
    });

    it('should return empty array for non-existent case', () => {
      const reviews = getReviewsByCaseId(results, 'TC999');

      expect(reviews).toHaveLength(0);
    });
  });

  describe('countReviewsByVerdict', () => {
    it('should count reviews by verdict', () => {
      const results = parseCodexReviewResults({
        reviews: [
          { assertionId: 'A001', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
          { assertionId: 'A002', caseId: 'TC001', reviewVerdict: 'agree', reasoning: 'OK' },
          { assertionId: 'A003', caseId: 'TC002', reviewVerdict: 'disagree', reasoning: 'Wrong' },
          { assertionId: 'A004', caseId: 'TC002', reviewVerdict: 'uncertain', reasoning: 'Not sure' },
        ],
      });

      const counts = countReviewsByVerdict(results);

      expect(counts.agree).toBe(2);
      expect(counts.disagree).toBe(1);
      expect(counts.uncertain).toBe(1);
    });

    it('should handle empty reviews', () => {
      const results = parseCodexReviewResults({ reviews: [] });

      const counts = countReviewsByVerdict(results);

      expect(counts.agree).toBe(0);
      expect(counts.disagree).toBe(0);
      expect(counts.uncertain).toBe(0);
    });
  });
});

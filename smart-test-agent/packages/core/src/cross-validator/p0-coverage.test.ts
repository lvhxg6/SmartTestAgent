/**
 * Unit tests for P0 Coverage Checker
 * @see Requirements 5.4, 5.5
 */

import { describe, it, expect } from 'vitest';
import {
  checkP0Coverage,
  getP0Requirements,
  getTestableP0Requirements,
  getP0CoverageDetails,
  calculateP0CoverageRate,
  validateP0Coverage,
} from './p0-coverage.js';
import type { Requirement, TestCase } from '@smart-test-agent/shared';

describe('P0 Coverage Checker', () => {
  const createRequirement = (
    id: string,
    priority: 'P0' | 'P1' | 'P2',
    testable: boolean = true
  ): Requirement => ({
    id: `req-${id}`,
    requirementId: id,
    runId: 'run-1',
    title: `Requirement ${id}`,
    description: `Description for ${id}`,
    priority,
    testable,
    route: '/test',
    acceptanceCriteria: ['AC1'],
    tags: [],
  });

  const createTestCase = (caseId: string, requirementId: string): TestCase => ({
    id: `tc-${caseId}`,
    caseId,
    runId: 'run-1',
    requirementId,
    route: '/test',
    title: `Test Case ${caseId}`,
    precondition: 'None',
    steps: [],
    assertions: [],
  });

  describe('checkP0Coverage', () => {
    it('should pass when all P0 requirements are covered', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
        createRequirement('REQ003', 'P1'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
        createTestCase('TC002', 'REQ002'),
      ];

      const result = checkP0Coverage(requirements, testCases);

      expect(result.status).toBe('pass');
      expect(result.missingP0Ids).toHaveLength(0);
    });

    it('should fail when P0 requirements are missing', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
      ];

      const result = checkP0Coverage(requirements, testCases);

      expect(result.status).toBe('fail');
      expect(result.missingP0Ids).toContain('REQ002');
    });

    it('should ignore non-testable P0 requirements', () => {
      const requirements = [
        createRequirement('REQ001', 'P0', true),
        createRequirement('REQ002', 'P0', false), // Not testable
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
      ];

      const result = checkP0Coverage(requirements, testCases);

      expect(result.status).toBe('pass');
    });

    it('should ignore P1 and P2 requirements', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P1'),
        createRequirement('REQ003', 'P2'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
      ];

      const result = checkP0Coverage(requirements, testCases);

      expect(result.status).toBe('pass');
    });

    it('should handle empty requirements', () => {
      const result = checkP0Coverage([], []);

      expect(result.status).toBe('pass');
      expect(result.missingP0Ids).toHaveLength(0);
    });

    it('should match by requirementId field', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'), // Matches requirementId
      ];

      const result = checkP0Coverage(requirements, testCases);

      expect(result.status).toBe('pass');
    });
  });

  describe('getP0Requirements', () => {
    it('should return only P0 requirements', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P1'),
        createRequirement('REQ003', 'P0'),
        createRequirement('REQ004', 'P2'),
      ];

      const p0 = getP0Requirements(requirements);

      expect(p0).toHaveLength(2);
      expect(p0.every((r) => r.priority === 'P0')).toBe(true);
    });
  });

  describe('getTestableP0Requirements', () => {
    it('should return only testable P0 requirements', () => {
      const requirements = [
        createRequirement('REQ001', 'P0', true),
        createRequirement('REQ002', 'P0', false),
        createRequirement('REQ003', 'P1', true),
      ];

      const testableP0 = getTestableP0Requirements(requirements);

      expect(testableP0).toHaveLength(1);
      expect(testableP0[0].requirementId).toBe('REQ001');
    });
  });

  describe('getP0CoverageDetails', () => {
    it('should return coverage details for each P0 requirement', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
        createTestCase('TC002', 'REQ001'),
      ];

      const details = getP0CoverageDetails(requirements, testCases);

      expect(details).toHaveLength(2);
      expect(details[0].requirementId).toBe('REQ001');
      expect(details[0].covered).toBe(true);
      expect(details[0].testCaseIds).toEqual(['TC001', 'TC002']);
      expect(details[1].requirementId).toBe('REQ002');
      expect(details[1].covered).toBe(false);
      expect(details[1].testCaseIds).toHaveLength(0);
    });
  });

  describe('calculateP0CoverageRate', () => {
    it('should calculate correct coverage rate', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
        createRequirement('REQ003', 'P0'),
        createRequirement('REQ004', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
        createTestCase('TC002', 'REQ002'),
        createTestCase('TC003', 'REQ003'),
      ];

      const rate = calculateP0CoverageRate(requirements, testCases);

      expect(rate).toBe(0.75);
    });

    it('should return 1 when no P0 requirements', () => {
      const requirements = [
        createRequirement('REQ001', 'P1'),
      ];

      const rate = calculateP0CoverageRate(requirements, []);

      expect(rate).toBe(1);
    });

    it('should return 0 when no test cases for P0', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
      ];

      const rate = calculateP0CoverageRate(requirements, []);

      expect(rate).toBe(0);
    });
  });

  describe('validateP0Coverage', () => {
    it('should validate against threshold', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
        createTestCase('TC002', 'REQ002'),
      ];

      const result = validateP0Coverage(requirements, testCases, 1.0);

      expect(result.valid).toBe(true);
      expect(result.rate).toBe(1);
    });

    it('should fail when below threshold', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
      ];

      const result = validateP0Coverage(requirements, testCases, 1.0);

      expect(result.valid).toBe(false);
      expect(result.rate).toBe(0.5);
      expect(result.message).toContain('REQ002');
    });

    it('should pass with lower threshold', () => {
      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P0'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001'),
      ];

      const result = validateP0Coverage(requirements, testCases, 0.5);

      expect(result.valid).toBe(true);
    });
  });
});

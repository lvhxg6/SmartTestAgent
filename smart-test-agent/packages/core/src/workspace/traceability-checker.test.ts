/**
 * Unit tests for Traceability Checker
 * @see Requirements 14.4, 14.5
 */

import { describe, it, expect } from 'vitest';
import {
  buildTraceabilityChains,
  checkTraceability,
  getExcludedAssertions,
  filterTraceable,
  getTraceabilitySummary,
} from './traceability-checker';
import type { Requirement, TestCase, Assertion } from '@smart-test-agent/shared';

describe('Traceability Checker', () => {
  // Helper functions
  function createRequirement(id: string): Requirement {
    return {
      id,
      requirementId: id,
      runId: 'run-1',
      title: `Requirement ${id}`,
      description: `Description for ${id}`,
      priority: 'P1',
      testable: true,
      route: '/test',
      acceptanceCriteria: [],
      tags: [],
    };
  }

  function createTestCase(caseId: string, requirementId: string): TestCase {
    return {
      id: caseId,
      caseId,
      runId: 'run-1',
      requirementId,
      route: '/test',
      title: `Test Case ${caseId}`,
      precondition: 'None',
      steps: [],
      assertions: [],
    };
  }

  function createAssertion(
    assertionId: string,
    caseId: string,
    evidencePath?: string
  ): Assertion {
    return {
      id: assertionId,
      assertionId,
      runId: 'run-1',
      caseId,
      type: 'element_visible',
      description: `Assertion ${assertionId}`,
      expected: 'expected',
      evidencePath,
      finalVerdict: 'pass',
    };
  }

  describe('buildTraceabilityChains', () => {
    it('should build chains for complete data', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [createTestCase('TC-001', 'REQ-001')];
      const assertions = [createAssertion('A-001', 'TC-001', '/evidence/screenshot.png')];

      const chains = buildTraceabilityChains(requirements, testCases, assertions);

      expect(chains.length).toBe(1);
      expect(chains[0]).toEqual({
        requirementId: 'REQ-001',
        caseId: 'TC-001',
        assertionId: 'A-001',
        evidencePath: '/evidence/screenshot.png',
      });
    });

    it('should build multiple chains', () => {
      const requirements = [
        createRequirement('REQ-001'),
        createRequirement('REQ-002'),
      ];
      const testCases = [
        createTestCase('TC-001', 'REQ-001'),
        createTestCase('TC-002', 'REQ-002'),
      ];
      const assertions = [
        createAssertion('A-001', 'TC-001', '/evidence/1.png'),
        createAssertion('A-002', 'TC-001', '/evidence/2.png'),
        createAssertion('A-003', 'TC-002', '/evidence/3.png'),
      ];

      const chains = buildTraceabilityChains(requirements, testCases, assertions);

      expect(chains.length).toBe(3);
    });

    it('should not include assertions with missing test case', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [createTestCase('TC-001', 'REQ-001')];
      const assertions = [
        createAssertion('A-001', 'TC-001', '/evidence/1.png'),
        createAssertion('A-002', 'TC-MISSING', '/evidence/2.png'), // Missing case
      ];

      const chains = buildTraceabilityChains(requirements, testCases, assertions);

      expect(chains.length).toBe(1);
      expect(chains[0].assertionId).toBe('A-001');
    });

    it('should not include assertions with missing requirement', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [
        createTestCase('TC-001', 'REQ-001'),
        createTestCase('TC-002', 'REQ-MISSING'), // Missing requirement
      ];
      const assertions = [
        createAssertion('A-001', 'TC-001', '/evidence/1.png'),
        createAssertion('A-002', 'TC-002', '/evidence/2.png'),
      ];

      const chains = buildTraceabilityChains(requirements, testCases, assertions);

      expect(chains.length).toBe(1);
      expect(chains[0].assertionId).toBe('A-001');
    });
  });

  describe('checkTraceability', () => {
    it('should return complete for fully traced data', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [createTestCase('TC-001', 'REQ-001')];
      const assertions = [createAssertion('A-001', 'TC-001', '/evidence/1.png')];

      const result = checkTraceability(requirements, testCases, assertions);

      expect(result.complete).toBe(true);
      expect(result.completeChains.length).toBe(1);
      expect(result.incompleteChains.length).toBe(0);
      expect(result.orphanedAssertions.length).toBe(0);
      expect(result.orphanedTestCases.length).toBe(0);
    });

    it('should identify incomplete chains (missing evidence)', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [createTestCase('TC-001', 'REQ-001')];
      const assertions = [createAssertion('A-001', 'TC-001')]; // No evidence

      const result = checkTraceability(requirements, testCases, assertions);

      expect(result.complete).toBe(false);
      expect(result.completeChains.length).toBe(0);
      expect(result.incompleteChains.length).toBe(1);
      expect(result.incompleteChains[0].assertionId).toBe('A-001');
    });

    it('should identify orphaned assertions (missing case)', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [createTestCase('TC-001', 'REQ-001')];
      const assertions = [
        createAssertion('A-001', 'TC-001', '/evidence/1.png'),
        createAssertion('A-002', 'TC-MISSING', '/evidence/2.png'),
      ];

      const result = checkTraceability(requirements, testCases, assertions);

      expect(result.complete).toBe(false);
      expect(result.orphanedAssertions).toContain('A-002');
    });

    it('should identify orphaned test cases (missing requirement)', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [
        createTestCase('TC-001', 'REQ-001'),
        createTestCase('TC-002', 'REQ-MISSING'),
      ];
      const assertions = [createAssertion('A-001', 'TC-001', '/evidence/1.png')];

      const result = checkTraceability(requirements, testCases, assertions);

      expect(result.orphanedTestCases).toContain('TC-002');
    });

    it('should handle mixed complete and incomplete chains', () => {
      const requirements = [createRequirement('REQ-001')];
      const testCases = [createTestCase('TC-001', 'REQ-001')];
      const assertions = [
        createAssertion('A-001', 'TC-001', '/evidence/1.png'), // Complete
        createAssertion('A-002', 'TC-001'), // Incomplete (no evidence)
      ];

      const result = checkTraceability(requirements, testCases, assertions);

      expect(result.complete).toBe(false);
      expect(result.completeChains.length).toBe(1);
      expect(result.incompleteChains.length).toBe(1);
    });
  });

  describe('getExcludedAssertions', () => {
    it('should return orphaned assertions', () => {
      const result = {
        complete: false,
        completeChains: [],
        incompleteChains: [],
        orphanedAssertions: ['A-001', 'A-002'],
        orphanedTestCases: [],
      };

      const excluded = getExcludedAssertions(result);

      expect(excluded.has('A-001')).toBe(true);
      expect(excluded.has('A-002')).toBe(true);
    });

    it('should return assertions with incomplete chains', () => {
      const result = {
        complete: false,
        completeChains: [],
        incompleteChains: [
          { requirementId: 'REQ-001', caseId: 'TC-001', assertionId: 'A-001' },
        ],
        orphanedAssertions: [],
        orphanedTestCases: [],
      };

      const excluded = getExcludedAssertions(result);

      expect(excluded.has('A-001')).toBe(true);
    });

    it('should return empty set for complete traceability', () => {
      const result = {
        complete: true,
        completeChains: [
          {
            requirementId: 'REQ-001',
            caseId: 'TC-001',
            assertionId: 'A-001',
            evidencePath: '/evidence/1.png',
          },
        ],
        incompleteChains: [],
        orphanedAssertions: [],
        orphanedTestCases: [],
      };

      const excluded = getExcludedAssertions(result);

      expect(excluded.size).toBe(0);
    });
  });

  describe('filterTraceable', () => {
    it('should filter out excluded assertions', () => {
      const assertions = [
        createAssertion('A-001', 'TC-001', '/evidence/1.png'),
        createAssertion('A-002', 'TC-001'),
        createAssertion('A-003', 'TC-MISSING'),
      ];

      const result = {
        complete: false,
        completeChains: [
          {
            requirementId: 'REQ-001',
            caseId: 'TC-001',
            assertionId: 'A-001',
            evidencePath: '/evidence/1.png',
          },
        ],
        incompleteChains: [
          { requirementId: 'REQ-001', caseId: 'TC-001', assertionId: 'A-002' },
        ],
        orphanedAssertions: ['A-003'],
        orphanedTestCases: [],
      };

      const filtered = filterTraceable(assertions, result);

      expect(filtered.length).toBe(1);
      expect(filtered[0].assertionId).toBe('A-001');
    });
  });

  describe('getTraceabilitySummary', () => {
    it('should calculate summary correctly', () => {
      const result = {
        complete: false,
        completeChains: [
          {
            requirementId: 'REQ-001',
            caseId: 'TC-001',
            assertionId: 'A-001',
            evidencePath: '/evidence/1.png',
          },
          {
            requirementId: 'REQ-001',
            caseId: 'TC-001',
            assertionId: 'A-002',
            evidencePath: '/evidence/2.png',
          },
        ],
        incompleteChains: [
          { requirementId: 'REQ-001', caseId: 'TC-001', assertionId: 'A-003' },
        ],
        orphanedAssertions: ['A-004'],
        orphanedTestCases: ['TC-002'],
      };

      const summary = getTraceabilitySummary(result, 4);

      expect(summary.totalAssertions).toBe(4);
      expect(summary.completeChains).toBe(2);
      expect(summary.incompleteChains).toBe(1);
      expect(summary.orphanedAssertions).toBe(1);
      expect(summary.orphanedTestCases).toBe(1);
      expect(summary.completenessRate).toBe(0.5); // 2 / 4
    });

    it('should return 1 for empty data', () => {
      const result = {
        complete: true,
        completeChains: [],
        incompleteChains: [],
        orphanedAssertions: [],
        orphanedTestCases: [],
      };

      const summary = getTraceabilitySummary(result, 0);

      expect(summary.completenessRate).toBe(1);
    });
  });
});

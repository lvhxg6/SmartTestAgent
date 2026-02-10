/**
 * Unit tests for Defect Aggregator
 * @see Requirements 10.1
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateDefects,
  determineSeverity,
  groupDefectsBySeverity,
  groupDefectsByRoute,
  countDefectsBySeverity,
  getAffectedRoutes,
  sortDefectsBySeverity,
} from './defect-aggregator.js';
import type { Assertion, TestCase, Requirement, DefectReport } from '@smart-test-agent/shared';

describe('Defect Aggregator', () => {
  const createAssertion = (
    assertionId: string,
    caseId: string,
    finalVerdict: 'pass' | 'fail' | 'error'
  ): Assertion => ({
    id: `a-${assertionId}`,
    assertionId,
    runId: 'run-1',
    caseId,
    type: 'element_visible',
    description: `Assertion ${assertionId}`,
    expected: 'expected',
    finalVerdict,
  });

  const createTestCase = (caseId: string, requirementId: string, route: string): TestCase => ({
    id: `tc-${caseId}`,
    caseId,
    runId: 'run-1',
    requirementId,
    route,
    title: `Test Case ${caseId}`,
    precondition: 'None',
    steps: [
      { stepNumber: 1, action: 'Click button' },
      { stepNumber: 2, action: 'Enter text', inputValue: 'test' },
    ],
    assertions: [],
  });

  const createRequirement = (
    requirementId: string,
    priority: 'P0' | 'P1' | 'P2'
  ): Requirement => ({
    id: `req-${requirementId}`,
    requirementId,
    runId: 'run-1',
    title: `Requirement ${requirementId}`,
    description: 'Description',
    priority,
    testable: true,
    route: '/test',
    acceptanceCriteria: [],
    tags: [],
  });

  describe('aggregateDefects', () => {
    it('should aggregate only failed assertions', () => {
      const assertions = [
        createAssertion('A001', 'TC001', 'pass'),
        createAssertion('A002', 'TC001', 'fail'),
        createAssertion('A003', 'TC002', 'fail'),
        createAssertion('A004', 'TC002', 'error'),
      ];

      const testCases = [
        createTestCase('TC001', 'REQ001', '/dashboard'),
        createTestCase('TC002', 'REQ002', '/users'),
      ];

      const requirements = [
        createRequirement('REQ001', 'P0'),
        createRequirement('REQ002', 'P1'),
      ];

      const defects = aggregateDefects(assertions, testCases, requirements);

      expect(defects).toHaveLength(2);
      expect(defects.every((d) => d.id.startsWith('DEF-'))).toBe(true);
    });

    it('should return empty array when no failed assertions', () => {
      const assertions = [
        createAssertion('A001', 'TC001', 'pass'),
        createAssertion('A002', 'TC001', 'pass'),
      ];

      const defects = aggregateDefects(assertions, [], []);

      expect(defects).toHaveLength(0);
    });

    it('should include test case information in defect', () => {
      const assertions = [createAssertion('A001', 'TC001', 'fail')];
      const testCases = [createTestCase('TC001', 'REQ001', '/dashboard')];
      const requirements = [createRequirement('REQ001', 'P0')];

      const defects = aggregateDefects(assertions, testCases, requirements);

      expect(defects[0].caseId).toBe('TC001');
      expect(defects[0].requirementId).toBe('REQ001');
      expect(defects[0].route).toBe('/dashboard');
      expect(defects[0].operationSteps).toHaveLength(2);
    });

    it('should handle missing test case', () => {
      const assertions = [createAssertion('A001', 'TC999', 'fail')];

      const defects = aggregateDefects(assertions, [], []);

      expect(defects).toHaveLength(1);
      expect(defects[0].caseId).toBe('TC999');
      expect(defects[0].route).toBe('');
    });
  });

  describe('determineSeverity', () => {
    it('should return critical for P0 requirements', () => {
      const assertion = createAssertion('A001', 'TC001', 'fail');
      const requirement = createRequirement('REQ001', 'P0');

      const severity = determineSeverity(assertion, requirement);

      expect(severity).toBe('critical');
    });

    it('should return major for P1 requirements', () => {
      const assertion = createAssertion('A001', 'TC001', 'fail');
      const requirement = createRequirement('REQ001', 'P1');

      const severity = determineSeverity(assertion, requirement);

      expect(severity).toBe('major');
    });

    it('should return major for fact_conflict', () => {
      const assertion: Assertion = {
        ...createAssertion('A001', 'TC001', 'fail'),
        conflictType: 'fact_conflict',
      };

      const severity = determineSeverity(assertion, undefined);

      expect(severity).toBe('major');
    });

    it('should return minor for evidence_missing', () => {
      const assertion: Assertion = {
        ...createAssertion('A001', 'TC001', 'fail'),
        conflictType: 'evidence_missing',
      };

      const severity = determineSeverity(assertion, undefined);

      expect(severity).toBe('minor');
    });

    it('should return suggestion for soft assertions', () => {
      const assertion: Assertion = {
        ...createAssertion('A001', 'TC001', 'fail'),
        type: 'soft',
      };

      const severity = determineSeverity(assertion, undefined);

      expect(severity).toBe('suggestion');
    });

    it('should return minor by default', () => {
      const assertion = createAssertion('A001', 'TC001', 'fail');
      const requirement = createRequirement('REQ001', 'P2');

      const severity = determineSeverity(assertion, requirement);

      expect(severity).toBe('minor');
    });
  });

  describe('groupDefectsBySeverity', () => {
    it('should group defects by severity', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D2', severity: 'major', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D3', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D4', severity: 'minor', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
      ];

      const groups = groupDefectsBySeverity(defects);

      expect(groups.critical).toHaveLength(2);
      expect(groups.major).toHaveLength(1);
      expect(groups.minor).toHaveLength(1);
      expect(groups.suggestion).toHaveLength(0);
    });
  });

  describe('groupDefectsByRoute', () => {
    it('should group defects by route', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/dashboard' },
        { id: 'D2', severity: 'major', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/users' },
        { id: 'D3', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/dashboard' },
      ];

      const groups = groupDefectsByRoute(defects);

      expect(groups.get('/dashboard')).toHaveLength(2);
      expect(groups.get('/users')).toHaveLength(1);
    });

    it('should handle empty route as "unknown"', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
      ];

      const groups = groupDefectsByRoute(defects);

      expect(groups.get('unknown')).toHaveLength(1);
    });
  });

  describe('countDefectsBySeverity', () => {
    it('should count defects by severity', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D2', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D3', severity: 'major', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
      ];

      const counts = countDefectsBySeverity(defects);

      expect(counts.critical).toBe(2);
      expect(counts.major).toBe(1);
      expect(counts.minor).toBe(0);
      expect(counts.suggestion).toBe(0);
    });
  });

  describe('getAffectedRoutes', () => {
    it('should return unique affected routes', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/dashboard' },
        { id: 'D2', severity: 'major', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/users' },
        { id: 'D3', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/dashboard' },
      ];

      const routes = getAffectedRoutes(defects);

      expect(routes).toHaveLength(2);
      expect(routes).toContain('/dashboard');
      expect(routes).toContain('/users');
    });

    it('should return sorted routes', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/users' },
        { id: 'D2', severity: 'major', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '/dashboard' },
      ];

      const routes = getAffectedRoutes(defects);

      expect(routes[0]).toBe('/dashboard');
      expect(routes[1]).toBe('/users');
    });
  });

  describe('sortDefectsBySeverity', () => {
    it('should sort defects by severity (critical first)', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'minor', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D2', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D3', severity: 'suggestion', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D4', severity: 'major', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
      ];

      const sorted = sortDefectsBySeverity(defects);

      expect(sorted[0].severity).toBe('critical');
      expect(sorted[1].severity).toBe('major');
      expect(sorted[2].severity).toBe('minor');
      expect(sorted[3].severity).toBe('suggestion');
    });

    it('should not modify original array', () => {
      const defects: DefectReport[] = [
        { id: 'D1', severity: 'minor', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
        { id: 'D2', severity: 'critical', title: '', description: '', screenshots: [], operationSteps: [], assertionId: '', caseId: '', requirementId: '', route: '' },
      ];

      sortDefectsBySeverity(defects);

      expect(defects[0].severity).toBe('minor');
    });
  });
});

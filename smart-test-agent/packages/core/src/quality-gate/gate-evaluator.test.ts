/**
 * Unit tests for Quality Gate Evaluator
 * @see Requirements 11.3, 11.4, 11.6
 */

import { describe, it, expect } from 'vitest';
import {
  checkP0Coverage,
  calculateAllMetrics,
  evaluateGate,
  formatGateResult,
} from './gate-evaluator';
import type { Requirement, TestCase, Assertion, TestRun } from '@smart-test-agent/shared';

describe('checkP0Coverage', () => {
  it('should pass when all P0 requirements are covered', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P0', true),
      createRequirement('REQ-003', 'P1', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
      createTestCase('TC-002', 'REQ-002'),
    ];

    const result = checkP0Coverage(requirements, testCases);

    expect(result.status).toBe('pass');
    expect(result.missingP0Ids).toEqual([]);
  });

  it('should fail when P0 requirements are not covered', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P0', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];

    const result = checkP0Coverage(requirements, testCases);

    expect(result.status).toBe('fail');
    expect(result.missingP0Ids).toContain('REQ-002');
  });

  it('should ignore non-testable P0 requirements', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P0', false), // non-testable
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];

    const result = checkP0Coverage(requirements, testCases);

    expect(result.status).toBe('pass');
    expect(result.missingP0Ids).toEqual([]);
  });

  it('should ignore P1/P2 requirements', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P1', true),
      createRequirement('REQ-003', 'P2', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];

    const result = checkP0Coverage(requirements, testCases);

    expect(result.status).toBe('pass');
  });
});

describe('calculateAllMetrics', () => {
  it('should calculate all metrics', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P1', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
      createTestCase('TC-002', 'REQ-002'),
    ];
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
      createAssertion('A-002', 'text_content', 'pass'),
    ];

    const metrics = calculateAllMetrics(requirements, testCases, assertions);

    expect(metrics.rc.name).toBe('RC');
    expect(metrics.rc.value).toBe(1);
    expect(metrics.apr.name).toBe('APR');
    expect(metrics.apr.value).toBe(1);
    expect(metrics.fr).toBeUndefined(); // No run history
  });

  it('should include FR when run history is provided', () => {
    const requirements: Requirement[] = [createRequirement('REQ-001', 'P0', true)];
    const testCases: TestCase[] = [createTestCase('TC-001', 'REQ-001')];
    const assertions: Assertion[] = [createAssertion('A-001', 'element_visible', 'pass')];
    const runHistory: TestRun[] = [
      createTestRun('run-1', [{ caseId: 'TC-001', status: 'passed' }]),
      createTestRun('run-2', [{ caseId: 'TC-001', status: 'passed' }]),
      createTestRun('run-3', [{ caseId: 'TC-001', status: 'passed' }]),
    ];

    const metrics = calculateAllMetrics(requirements, testCases, assertions, runHistory);

    expect(metrics.fr).toBeDefined();
    expect(metrics.fr!.name).toBe('FR');
  });
});

describe('evaluateGate', () => {
  it('should pass when all metrics meet thresholds', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
    ];

    const result = evaluateGate(requirements, testCases, assertions);

    expect(result.passed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('should block when RC < 0.85', () => {
    const requirements: Requirement[] = Array.from({ length: 10 }, (_, i) =>
      createRequirement(`REQ-${i}`, 'P1', true)
    );
    const testCases: TestCase[] = Array.from({ length: 8 }, (_, i) =>
      createTestCase(`TC-${i}`, `REQ-${i}`)
    );
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
    ];

    const result = evaluateGate(requirements, testCases, assertions);

    expect(result.blocked).toBe(true);
    expect(result.warnings.some((w) => w.includes('RC'))).toBe(true);
  });

  it('should block when P0 requirements are not covered', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P0', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
    ];

    const result = evaluateGate(requirements, testCases, assertions);

    expect(result.blocked).toBe(true);
    expect(result.warnings.some((w) => w.includes('P0'))).toBe(true);
  });

  it('should warn when APR < 0.95', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];
    const assertions: Assertion[] = [
      ...Array.from({ length: 9 }, (_, i) =>
        createAssertion(`A-${i}`, 'element_visible', 'pass')
      ),
      createAssertion('A-9', 'element_visible', 'fail'),
    ];

    const result = evaluateGate(requirements, testCases, assertions);

    expect(result.blocked).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.warnings.some((w) => w.includes('APR'))).toBe(true);
  });

  it('should warn when FR > 0.05', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
    ];
    // 10 test cases, 1 flaky = 10%
    const tcList = Array.from({ length: 10 }, (_, i) => ({
      caseId: `TC-${i}`,
      status: 'passed' as const,
    }));
    const runHistory: TestRun[] = [
      createTestRun('run-1', tcList),
      createTestRun('run-2', tcList.map((tc, i) =>
        i === 0 ? { ...tc, status: 'failed' as const } : tc
      )),
      createTestRun('run-3', tcList),
    ];

    const result = evaluateGate(requirements, testCases, assertions, runHistory);

    expect(result.blocked).toBe(false);
    expect(result.warnings.some((w) => w.includes('FR'))).toBe(true);
  });

  it('should respect custom thresholds', () => {
    const requirements: Requirement[] = Array.from({ length: 10 }, (_, i) =>
      createRequirement(`REQ-${i}`, 'P1', true)
    );
    const testCases: TestCase[] = Array.from({ length: 7 }, (_, i) =>
      createTestCase(`TC-${i}`, `REQ-${i}`)
    );
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
    ];

    const result = evaluateGate(requirements, testCases, assertions, [], {
      rcThreshold: 0.7, // Lower threshold
    });

    expect(result.blocked).toBe(false);
  });

  it('should not block on P0 failure when configured', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', 'P0', true),
      createRequirement('REQ-002', 'P0', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
    ];
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
    ];

    const result = evaluateGate(requirements, testCases, assertions, [], {
      blockOnP0Failure: false,
    });

    // Still blocked due to RC < 0.85 (50%)
    expect(result.blocked).toBe(true);
  });
});

describe('formatGateResult', () => {
  it('should format passed result', () => {
    const result = evaluateGate(
      [createRequirement('REQ-001', 'P0', true)],
      [createTestCase('TC-001', 'REQ-001')],
      [createAssertion('A-001', 'element_visible', 'pass')]
    );

    const formatted = formatGateResult(result);

    expect(formatted).toContain('PASSED');
    expect(formatted).toContain('RC');
    expect(formatted).toContain('APR');
  });

  it('should format blocked result', () => {
    const result = evaluateGate(
      [createRequirement('REQ-001', 'P0', true), createRequirement('REQ-002', 'P0', true)],
      [createTestCase('TC-001', 'REQ-001')],
      [createAssertion('A-001', 'element_visible', 'pass')]
    );

    const formatted = formatGateResult(result);

    expect(formatted).toContain('BLOCKED');
    expect(formatted).toContain('Warnings');
  });

  it('should format result with warnings', () => {
    const result = evaluateGate(
      [createRequirement('REQ-001', 'P0', true)],
      [createTestCase('TC-001', 'REQ-001')],
      [
        createAssertion('A-001', 'element_visible', 'pass'),
        createAssertion('A-002', 'element_visible', 'fail'),
      ]
    );

    const formatted = formatGateResult(result);

    expect(formatted).toContain('WARNINGS');
    expect(formatted).toContain('APR');
  });
});

// Helper functions
function createRequirement(
  id: string,
  priority: 'P0' | 'P1' | 'P2',
  testable: boolean
): Requirement {
  return {
    id,
    requirementId: id,
    runId: 'run-1',
    title: `Requirement ${id}`,
    description: `Description for ${id}`,
    priority,
    testable,
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
  id: string,
  type: 'element_visible' | 'text_content' | 'element_count' | 'navigation' | 'soft',
  finalVerdict: 'pass' | 'fail' | 'error'
): Assertion {
  return {
    id,
    assertionId: id,
    runId: 'run-1',
    caseId: 'TC-001',
    type,
    description: `Assertion ${id}`,
    expected: 'expected value',
    finalVerdict,
  };
}

function createTestRun(
  id: string,
  testCases: Array<{ caseId: string; status: 'passed' | 'failed' | 'error' }>
): TestRun {
  return {
    id,
    projectId: 'project-1',
    state: 'completed',
    prdPath: '/prd.md',
    testedRoutes: ['/test'],
    workspacePath: '/workspace',
    envFingerprint: {},
    agentVersions: { claudeCode: '1.0', codex: '1.0' },
    promptVersions: { prdParse: '1.0', uiTestExecute: '1.0', reviewResults: '1.0' },
    decisionLog: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    testCases: testCases.map((tc) => ({
      id: tc.caseId,
      caseId: tc.caseId,
      runId: id,
      requirementId: 'REQ-001',
      route: '/test',
      title: `Test Case ${tc.caseId}`,
      precondition: 'None',
      steps: [],
      assertions: [],
      status: tc.status,
    })),
  };
}

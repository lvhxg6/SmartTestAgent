/**
 * Unit tests for Quality Gate Metrics Calculator
 * @see Requirements 11.1, 11.2, 11.5
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRC,
  calculateAPR,
  calculateFR,
  getRCBreakdown,
  getAPRBreakdown,
  getFlakyTestCases,
} from './metrics-calculator';
import type { Requirement, TestCase, Assertion, TestRun } from '@smart-test-agent/shared';

describe('calculateRC', () => {
  it('should return 1 when no testable requirements', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', false),
      createRequirement('REQ-002', false),
    ];
    const testCases: TestCase[] = [];

    const result = calculateRC(requirements, testCases);

    expect(result.name).toBe('RC');
    expect(result.value).toBe(1);
    expect(result.threshold).toBe(0.85);
    expect(result.passed).toBe(true);
  });

  it('should calculate RC correctly with all requirements covered', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', true),
      createRequirement('REQ-002', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
      createTestCase('TC-002', 'REQ-002'),
    ];

    const result = calculateRC(requirements, testCases);

    expect(result.value).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('should calculate RC correctly with partial coverage', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', true),
      createRequirement('REQ-002', true),
      createRequirement('REQ-003', true),
      createRequirement('REQ-004', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
      createTestCase('TC-002', 'REQ-002'),
      createTestCase('TC-003', 'REQ-003'),
    ];

    const result = calculateRC(requirements, testCases);

    expect(result.value).toBe(0.75);
    expect(result.passed).toBe(false); // 0.75 < 0.85
  });

  it('should exclude non-testable requirements from calculation', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', true),
      createRequirement('REQ-002', true),
      createRequirement('REQ-003', false), // non-testable
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
      createTestCase('TC-002', 'REQ-002'),
    ];

    const result = calculateRC(requirements, testCases);

    expect(result.value).toBe(1); // 2/2 testable covered
    expect(result.passed).toBe(true);
  });

  it('should pass when RC >= 0.85', () => {
    const requirements: Requirement[] = Array.from({ length: 100 }, (_, i) =>
      createRequirement(`REQ-${i}`, true)
    );
    const testCases: TestCase[] = Array.from({ length: 85 }, (_, i) =>
      createTestCase(`TC-${i}`, `REQ-${i}`)
    );

    const result = calculateRC(requirements, testCases);

    expect(result.value).toBe(0.85);
    expect(result.passed).toBe(true);
  });

  it('should fail when RC < 0.85', () => {
    const requirements: Requirement[] = Array.from({ length: 100 }, (_, i) =>
      createRequirement(`REQ-${i}`, true)
    );
    const testCases: TestCase[] = Array.from({ length: 84 }, (_, i) =>
      createTestCase(`TC-${i}`, `REQ-${i}`)
    );

    const result = calculateRC(requirements, testCases);

    expect(result.value).toBe(0.84);
    expect(result.passed).toBe(false);
  });
});

describe('calculateAPR', () => {
  it('should return 1 when no deterministic assertions', () => {
    const assertions: Assertion[] = [
      createAssertion('A-001', 'soft', 'pass'),
      createAssertion('A-002', 'soft', 'fail'),
    ];

    const result = calculateAPR(assertions);

    expect(result.name).toBe('APR');
    expect(result.value).toBe(1);
    expect(result.threshold).toBe(0.95);
    expect(result.passed).toBe(true);
  });

  it('should calculate APR correctly with all assertions passed', () => {
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
      createAssertion('A-002', 'text_content', 'pass'),
      createAssertion('A-003', 'navigation', 'pass'),
    ];

    const result = calculateAPR(assertions);

    expect(result.value).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('should calculate APR correctly with some failures', () => {
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
      createAssertion('A-002', 'text_content', 'pass'),
      createAssertion('A-003', 'navigation', 'fail'),
      createAssertion('A-004', 'element_count', 'pass'),
    ];

    const result = calculateAPR(assertions);

    expect(result.value).toBe(0.75);
    expect(result.passed).toBe(false); // 0.75 < 0.95
  });

  it('should exclude soft assertions from calculation', () => {
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
      createAssertion('A-002', 'soft', 'fail'), // excluded
      createAssertion('A-003', 'text_content', 'pass'),
    ];

    const result = calculateAPR(assertions);

    expect(result.value).toBe(1); // 2/2 deterministic passed
    expect(result.passed).toBe(true);
  });

  it('should pass when APR >= 0.95', () => {
    const assertions: Assertion[] = [
      ...Array.from({ length: 95 }, (_, i) =>
        createAssertion(`A-${i}`, 'element_visible', 'pass')
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        createAssertion(`A-${95 + i}`, 'element_visible', 'fail')
      ),
    ];

    const result = calculateAPR(assertions);

    expect(result.value).toBe(0.95);
    expect(result.passed).toBe(true);
  });

  it('should fail when APR < 0.95', () => {
    const assertions: Assertion[] = [
      ...Array.from({ length: 94 }, (_, i) =>
        createAssertion(`A-${i}`, 'element_visible', 'pass')
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        createAssertion(`A-${94 + i}`, 'element_visible', 'fail')
      ),
    ];

    const result = calculateAPR(assertions);

    expect(result.value).toBe(0.94);
    expect(result.passed).toBe(false);
  });

  it('should handle error verdicts as non-pass', () => {
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
      createAssertion('A-002', 'text_content', 'error'),
    ];

    const result = calculateAPR(assertions);

    expect(result.value).toBe(0.5);
    expect(result.passed).toBe(false);
  });
});

describe('calculateFR', () => {
  it('should return null when less than 3 runs', () => {
    const runHistory: TestRun[] = [
      createTestRun('run-1', [{ caseId: 'TC-001', status: 'passed' }]),
      createTestRun('run-2', [{ caseId: 'TC-001', status: 'passed' }]),
    ];

    const result = calculateFR(runHistory);

    expect(result).toBeNull();
  });

  it('should return null when no test cases have 3+ executions', () => {
    const runHistory: TestRun[] = [
      createTestRun('run-1', [{ caseId: 'TC-001', status: 'passed' }]),
      createTestRun('run-2', [{ caseId: 'TC-002', status: 'passed' }]),
      createTestRun('run-3', [{ caseId: 'TC-003', status: 'passed' }]),
    ];

    const result = calculateFR(runHistory);

    expect(result).toBeNull();
  });

  it('should calculate FR = 0 when no flaky tests', () => {
    const runHistory: TestRun[] = [
      createTestRun('run-1', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
      createTestRun('run-2', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
      createTestRun('run-3', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
    ];

    const result = calculateFR(runHistory);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('FR');
    expect(result!.value).toBe(0);
    expect(result!.threshold).toBe(0.05);
    expect(result!.passed).toBe(true);
  });

  it('should detect flaky tests with inconsistent results', () => {
    const runHistory: TestRun[] = [
      createTestRun('run-1', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
      createTestRun('run-2', [
        { caseId: 'TC-001', status: 'failed' }, // flaky
        { caseId: 'TC-002', status: 'passed' },
      ]),
      createTestRun('run-3', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
    ];

    const result = calculateFR(runHistory);

    expect(result).not.toBeNull();
    expect(result!.value).toBe(0.5); // 1 flaky / 2 automated
    expect(result!.passed).toBe(false); // 0.5 > 0.05
  });

  it('should pass when FR <= 0.05', () => {
    // 20 test cases, 1 flaky = 5%
    const testCases = Array.from({ length: 20 }, (_, i) => ({
      caseId: `TC-${i}`,
      status: 'passed' as const,
    }));

    const runHistory: TestRun[] = [
      createTestRun('run-1', testCases),
      createTestRun('run-2', testCases.map((tc, i) =>
        i === 0 ? { ...tc, status: 'failed' as const } : tc
      )),
      createTestRun('run-3', testCases),
    ];

    const result = calculateFR(runHistory);

    expect(result).not.toBeNull();
    expect(result!.value).toBe(0.05);
    expect(result!.passed).toBe(true);
  });

  it('should fail when FR > 0.05', () => {
    // 10 test cases, 1 flaky = 10%
    const testCases = Array.from({ length: 10 }, (_, i) => ({
      caseId: `TC-${i}`,
      status: 'passed' as const,
    }));

    const runHistory: TestRun[] = [
      createTestRun('run-1', testCases),
      createTestRun('run-2', testCases.map((tc, i) =>
        i === 0 ? { ...tc, status: 'failed' as const } : tc
      )),
      createTestRun('run-3', testCases),
    ];

    const result = calculateFR(runHistory);

    expect(result).not.toBeNull();
    expect(result!.value).toBe(0.1);
    expect(result!.passed).toBe(false);
  });
});

describe('getRCBreakdown', () => {
  it('should return detailed breakdown', () => {
    const requirements: Requirement[] = [
      createRequirement('REQ-001', true),
      createRequirement('REQ-002', true),
      createRequirement('REQ-003', true),
    ];
    const testCases: TestCase[] = [
      createTestCase('TC-001', 'REQ-001'),
      createTestCase('TC-002', 'REQ-002'),
    ];

    const breakdown = getRCBreakdown(requirements, testCases);

    expect(breakdown.totalTestable).toBe(3);
    expect(breakdown.covered).toBe(2);
    expect(breakdown.uncovered).toContain('REQ-003');
    expect(breakdown.rate).toBeCloseTo(0.667, 2);
  });
});

describe('getAPRBreakdown', () => {
  it('should return detailed breakdown', () => {
    const assertions: Assertion[] = [
      createAssertion('A-001', 'element_visible', 'pass'),
      createAssertion('A-002', 'text_content', 'fail'),
      createAssertion('A-003', 'navigation', 'error'),
      createAssertion('A-004', 'soft', 'fail'), // excluded
    ];

    const breakdown = getAPRBreakdown(assertions);

    expect(breakdown.totalDeterministic).toBe(3);
    expect(breakdown.passed).toBe(1);
    expect(breakdown.failed).toBe(1);
    expect(breakdown.errors).toBe(1);
    expect(breakdown.rate).toBeCloseTo(0.333, 2);
  });
});

describe('getFlakyTestCases', () => {
  it('should return empty array when less than 3 runs', () => {
    const runHistory: TestRun[] = [
      createTestRun('run-1', [{ caseId: 'TC-001', status: 'passed' }]),
    ];

    const result = getFlakyTestCases(runHistory);

    expect(result).toEqual([]);
  });

  it('should identify flaky test cases', () => {
    const runHistory: TestRun[] = [
      createTestRun('run-1', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
      createTestRun('run-2', [
        { caseId: 'TC-001', status: 'failed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
      createTestRun('run-3', [
        { caseId: 'TC-001', status: 'passed' },
        { caseId: 'TC-002', status: 'passed' },
      ]),
    ];

    const result = getFlakyTestCases(runHistory);

    expect(result).toContain('TC-001');
    expect(result).not.toContain('TC-002');
  });
});

// Helper functions
function createRequirement(id: string, testable: boolean): Requirement {
  return {
    id,
    requirementId: id,
    runId: 'run-1',
    title: `Requirement ${id}`,
    description: `Description for ${id}`,
    priority: 'P1',
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

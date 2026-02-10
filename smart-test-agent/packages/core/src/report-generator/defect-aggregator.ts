/**
 * Defect Aggregator
 * Collects and aggregates defects from assertion results
 * @see Requirements 10.1
 */

import type {
  Assertion,
  TestCase,
  Requirement,
  DefectReport,
  DefectSeverity,
  TestStep,
} from '@smart-test-agent/shared';

/**
 * Aggregate defects from assertions with final_verdict = 'fail'
 * @see Requirements 10.1
 */
export function aggregateDefects(
  assertions: Assertion[],
  testCases: TestCase[],
  requirements: Requirement[]
): DefectReport[] {
  // Filter failed assertions
  const failedAssertions = assertions.filter((a) => a.finalVerdict === 'fail');

  // Build lookup maps
  const testCaseMap = new Map(testCases.map((tc) => [tc.caseId, tc]));
  const requirementMap = new Map(requirements.map((r) => [r.requirementId, r]));

  // Generate defect reports
  const defects: DefectReport[] = [];

  for (const assertion of failedAssertions) {
    const testCase = testCaseMap.get(assertion.caseId);
    const requirement = testCase ? requirementMap.get(testCase.requirementId) : undefined;

    const defect = createDefectReport(assertion, testCase, requirement);
    defects.push(defect);
  }

  return defects;
}

/**
 * Create a defect report from a failed assertion
 */
function createDefectReport(
  assertion: Assertion,
  testCase?: TestCase,
  requirement?: Requirement
): DefectReport {
  const severity = determineSeverity(assertion, requirement);
  const title = generateDefectTitle(assertion, testCase);
  const description = generateDefectDescription(assertion, testCase);
  const operationSteps = extractOperationSteps(testCase);
  const screenshots = assertion.evidencePath ? [assertion.evidencePath] : [];

  return {
    id: `DEF-${assertion.assertionId}`,
    severity,
    title,
    description,
    screenshots,
    operationSteps,
    assertionId: assertion.assertionId,
    caseId: assertion.caseId,
    requirementId: testCase?.requirementId || '',
    route: testCase?.route || '',
  };
}

/**
 * Determine defect severity based on assertion and requirement
 * @see Requirements 10.3
 */
export function determineSeverity(
  assertion: Assertion,
  requirement?: Requirement
): DefectSeverity {
  // P0 requirements are critical
  if (requirement?.priority === 'P0') {
    return 'critical';
  }

  // P1 requirements are major
  if (requirement?.priority === 'P1') {
    return 'major';
  }

  // Conflict type affects severity
  if (assertion.conflictType === 'fact_conflict') {
    return 'major';
  }

  if (assertion.conflictType === 'evidence_missing') {
    return 'minor';
  }

  // Soft assertions with disagreement are suggestions
  if (assertion.type === 'soft') {
    return 'suggestion';
  }

  // Default to minor
  return 'minor';
}

/**
 * Generate defect title
 */
function generateDefectTitle(assertion: Assertion, testCase?: TestCase): string {
  if (testCase) {
    return `[${testCase.caseId}] ${assertion.description}`;
  }
  return `[${assertion.assertionId}] ${assertion.description}`;
}

/**
 * Generate defect description
 */
function generateDefectDescription(assertion: Assertion, testCase?: TestCase): string {
  const parts: string[] = [];

  parts.push(`**断言描述**: ${assertion.description}`);
  parts.push(`**期望结果**: ${assertion.expected}`);

  if (assertion.actual) {
    parts.push(`**实际结果**: ${assertion.actual}`);
  }

  if (assertion.agentReasoning) {
    parts.push(`**AI 分析**: ${assertion.agentReasoning}`);
  }

  if (testCase) {
    parts.push(`**测试用例**: ${testCase.title}`);
    parts.push(`**前置条件**: ${testCase.precondition}`);
  }

  return parts.join('\n\n');
}

/**
 * Extract operation steps from test case
 */
function extractOperationSteps(testCase?: TestCase): string[] {
  if (!testCase || !testCase.steps) {
    return [];
  }

  return testCase.steps.map((step: TestStep) => {
    let stepText = `${step.stepNumber}. ${step.action}`;
    if (step.inputValue) {
      stepText += ` (输入: ${step.inputValue})`;
    }
    return stepText;
  });
}

/**
 * Group defects by severity
 */
export function groupDefectsBySeverity(
  defects: DefectReport[]
): Record<DefectSeverity, DefectReport[]> {
  const groups: Record<DefectSeverity, DefectReport[]> = {
    critical: [],
    major: [],
    minor: [],
    suggestion: [],
  };

  for (const defect of defects) {
    groups[defect.severity].push(defect);
  }

  return groups;
}

/**
 * Group defects by route
 */
export function groupDefectsByRoute(
  defects: DefectReport[]
): Map<string, DefectReport[]> {
  const groups = new Map<string, DefectReport[]>();

  for (const defect of defects) {
    const route = defect.route || 'unknown';
    const existing = groups.get(route) || [];
    existing.push(defect);
    groups.set(route, existing);
  }

  return groups;
}

/**
 * Count defects by severity
 */
export function countDefectsBySeverity(
  defects: DefectReport[]
): Record<DefectSeverity, number> {
  const counts: Record<DefectSeverity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    suggestion: 0,
  };

  for (const defect of defects) {
    counts[defect.severity]++;
  }

  return counts;
}

/**
 * Get affected routes from defects
 */
export function getAffectedRoutes(defects: DefectReport[]): string[] {
  const routes = new Set<string>();

  for (const defect of defects) {
    if (defect.route) {
      routes.add(defect.route);
    }
  }

  return Array.from(routes).sort();
}

/**
 * Sort defects by severity (critical first)
 */
export function sortDefectsBySeverity(defects: DefectReport[]): DefectReport[] {
  const severityOrder: Record<DefectSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    suggestion: 3,
  };

  return [...defects].sort((a, b) => {
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

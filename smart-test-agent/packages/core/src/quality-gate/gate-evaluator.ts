/**
 * Quality Gate Evaluator
 * Evaluates quality metrics against thresholds
 * @see Requirements 11.3, 11.4, 11.6
 */

import type {
  Requirement,
  TestCase,
  Assertion,
  TestRun,
  QualityMetric,
  QualityMetrics,
  GateResult,
  P0CoverageCheck,
} from '@smart-test-agent/shared';
import { calculateRC, calculateAPR, calculateFR, getRCBreakdown } from './metrics-calculator.js';

/**
 * Gate evaluation configuration
 */
export interface GateConfig {
  /** RC threshold (default: 0.85) */
  rcThreshold: number;
  /** APR threshold (default: 0.95) */
  aprThreshold: number;
  /** FR threshold (default: 0.05) */
  frThreshold: number;
  /** Whether to block on P0 coverage failure */
  blockOnP0Failure: boolean;
}

const DEFAULT_CONFIG: GateConfig = {
  rcThreshold: 0.85,
  aprThreshold: 0.95,
  frThreshold: 0.05,
  blockOnP0Failure: true,
};

/**
 * Check P0 requirements coverage
 * @see Requirements 5.4, 5.5
 */
export function checkP0Coverage(
  requirements: Requirement[],
  testCases: TestCase[]
): P0CoverageCheck {
  const p0Requirements = requirements.filter((r) => r.priority === 'P0' && r.testable);
  const coveredRequirementIds = new Set(testCases.map((tc) => tc.requirementId));

  const missingP0Ids: string[] = [];
  for (const req of p0Requirements) {
    if (!coveredRequirementIds.has(req.id) && !coveredRequirementIds.has(req.requirementId)) {
      missingP0Ids.push(req.requirementId);
    }
  }

  return {
    status: missingP0Ids.length === 0 ? 'pass' : 'fail',
    missingP0Ids,
  };
}

/**
 * Calculate all quality metrics
 */
export function calculateAllMetrics(
  requirements: Requirement[],
  testCases: TestCase[],
  assertions: Assertion[],
  runHistory: TestRun[] = []
): QualityMetrics {
  const rc = calculateRC(requirements, testCases);
  const apr = calculateAPR(assertions);
  const fr = calculateFR(runHistory);

  return {
    rc,
    apr,
    fr: fr ?? undefined,
  };
}

/**
 * Evaluate quality gate
 * @see Requirements 11.3, 11.4, 11.6
 * 
 * Rules:
 * - RC < 0.85 OR P0 not covered → blocked
 * - APR < 0.95 → warning
 * - FR > 0.05 → warning + mark flaky
 */
export function evaluateGate(
  requirements: Requirement[],
  testCases: TestCase[],
  assertions: Assertion[],
  runHistory: TestRun[] = [],
  config: Partial<GateConfig> = {}
): GateResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const warnings: string[] = [];
  let blocked = false;

  // Calculate metrics
  const rc = calculateRC(requirements, testCases);
  const apr = calculateAPR(assertions);
  const fr = calculateFR(runHistory);

  const metrics: QualityMetric[] = [rc, apr];
  if (fr) {
    metrics.push(fr);
  }

  // Check P0 coverage
  const p0Check = checkP0Coverage(requirements, testCases);
  if (p0Check.status === 'fail' && fullConfig.blockOnP0Failure) {
    blocked = true;
    warnings.push(`P0 requirements not covered: ${p0Check.missingP0Ids.join(', ')}`);
  }

  // Check RC threshold
  if (rc.value < fullConfig.rcThreshold) {
    blocked = true;
    const breakdown = getRCBreakdown(requirements, testCases);
    warnings.push(
      `RC (${(rc.value * 100).toFixed(1)}%) below threshold (${fullConfig.rcThreshold * 100}%). ` +
      `Uncovered: ${breakdown.uncovered.join(', ')}`
    );
  }

  // Check APR threshold (warning only)
  if (apr.value < fullConfig.aprThreshold) {
    warnings.push(
      `APR (${(apr.value * 100).toFixed(1)}%) below threshold (${fullConfig.aprThreshold * 100}%)`
    );
  }

  // Check FR threshold (warning only)
  if (fr && fr.value > fullConfig.frThreshold) {
    warnings.push(
      `FR (${(fr.value * 100).toFixed(1)}%) above threshold (${fullConfig.frThreshold * 100}%). ` +
      `Tests marked as flaky.`
    );
  }

  return {
    passed: !blocked && warnings.length === 0,
    blocked,
    warnings,
    metrics,
  };
}

/**
 * Format gate result as human-readable string
 */
export function formatGateResult(result: GateResult): string {
  const lines: string[] = [];

  lines.push('## Quality Gate Results\n');

  // Status
  if (result.blocked) {
    lines.push('**Status: ❌ BLOCKED**\n');
  } else if (result.warnings.length > 0) {
    lines.push('**Status: ⚠️ PASSED WITH WARNINGS**\n');
  } else {
    lines.push('**Status: ✅ PASSED**\n');
  }

  // Metrics
  lines.push('### Metrics\n');
  for (const metric of result.metrics) {
    const status = metric.passed ? '✅' : '❌';
    const comparison = metric.name === 'FR' ? '≤' : '≥';
    lines.push(
      `- ${metric.name}: ${(metric.value * 100).toFixed(1)}% ${status} ` +
      `(threshold: ${comparison} ${(metric.threshold * 100).toFixed(1)}%)`
    );
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('\n### Warnings\n');
    for (const warning of result.warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
  }

  return lines.join('\n');
}

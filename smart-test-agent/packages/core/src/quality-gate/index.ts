/**
 * Quality Gate Module
 * Provides quality metrics calculation and gate evaluation
 * @see Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

export {
  calculateRC,
  calculateAPR,
  calculateFR,
  getRCBreakdown,
  getAPRBreakdown,
  getFlakyTestCases,
  type RCBreakdown,
  type APRBreakdown,
} from './metrics-calculator.js';

export {
  checkP0Coverage,
  calculateAllMetrics,
  evaluateGate,
  formatGateResult,
  type GateConfig,
} from './gate-evaluator.js';

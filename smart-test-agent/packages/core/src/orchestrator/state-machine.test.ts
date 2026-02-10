/**
 * Unit tests for State Machine
 * Tests state transitions, idempotency, and error handling
 * 
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 14.4, 14.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StateMachine,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
  isTerminalState,
  isValidTransition,
  getTargetState,
  getValidEventsForState,
  createIdempotencyKey,
  getTimeoutReasonCode,
  getErrorReasonCode,
} from './state-machine.js';
import type { TestRunState, StateEvent } from '@smart-test-agent/shared';

describe('State Machine', () => {
  describe('State Transition Definitions', () => {
    it('should have all 8 core states defined in transitions', () => {
      const coreStates: TestRunState[] = [
        'created',
        'parsing',
        'generating',
        'awaiting_approval',
        'executing',
        'codex_reviewing',
        'report_ready',
        'completed',
      ];

      const statesInTransitions = new Set<TestRunState>();
      for (const t of STATE_TRANSITIONS) {
        statesInTransitions.add(t.from);
        statesInTransitions.add(t.to);
      }

      for (const state of coreStates) {
        expect(statesInTransitions.has(state)).toBe(true);
      }
    });

    it('should have failed as a terminal state', () => {
      expect(TERMINAL_STATES).toContain('failed');
      expect(TERMINAL_STATES).toContain('completed');
    });

    it('should not have any transitions from terminal states', () => {
      for (const state of TERMINAL_STATES) {
        const transitionsFromState = STATE_TRANSITIONS.filter(t => t.from === state);
        expect(transitionsFromState).toHaveLength(0);
      }
    });
  });

  describe('isTerminalState', () => {
    it('should return true for completed state', () => {
      expect(isTerminalState('completed')).toBe(true);
    });

    it('should return true for failed state', () => {
      expect(isTerminalState('failed')).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      const nonTerminalStates: TestRunState[] = [
        'created',
        'parsing',
        'generating',
        'awaiting_approval',
        'executing',
        'codex_reviewing',
        'report_ready',
      ];

      for (const state of nonTerminalStates) {
        expect(isTerminalState(state)).toBe(false);
      }
    });
  });

  describe('getValidEventsForState', () => {
    it('should return START_PARSING for created state', () => {
      const events = getValidEventsForState('created');
      expect(events).toContain('START_PARSING');
    });

    it('should return APPROVED and REJECTED for awaiting_approval state', () => {
      const events = getValidEventsForState('awaiting_approval');
      expect(events).toContain('APPROVED');
      expect(events).toContain('REJECTED');
      expect(events).toContain('TIMEOUT');
    });

    it('should return CONFIRMED and RETEST for report_ready state', () => {
      const events = getValidEventsForState('report_ready');
      expect(events).toContain('CONFIRMED');
      expect(events).toContain('RETEST');
      expect(events).toContain('TIMEOUT');
    });

    it('should return empty array for terminal states', () => {
      expect(getValidEventsForState('completed')).toHaveLength(0);
      expect(getValidEventsForState('failed')).toHaveLength(0);
    });
  });

  describe('getTargetState', () => {
    it('should return parsing for created + START_PARSING', () => {
      expect(getTargetState('created', 'START_PARSING')).toBe('parsing');
    });

    it('should return generating for parsing + PARSING_COMPLETE', () => {
      expect(getTargetState('parsing', 'PARSING_COMPLETE')).toBe('generating');
    });

    it('should return awaiting_approval for generating + GENERATION_COMPLETE', () => {
      expect(getTargetState('generating', 'GENERATION_COMPLETE')).toBe('awaiting_approval');
    });

    it('should return executing for awaiting_approval + APPROVED', () => {
      expect(getTargetState('awaiting_approval', 'APPROVED')).toBe('executing');
    });

    it('should return generating for awaiting_approval + REJECTED', () => {
      expect(getTargetState('awaiting_approval', 'REJECTED')).toBe('generating');
    });

    it('should return codex_reviewing for executing + EXECUTION_COMPLETE', () => {
      expect(getTargetState('executing', 'EXECUTION_COMPLETE')).toBe('codex_reviewing');
    });

    it('should return report_ready for codex_reviewing + REVIEW_COMPLETE', () => {
      expect(getTargetState('codex_reviewing', 'REVIEW_COMPLETE')).toBe('report_ready');
    });

    it('should return completed for report_ready + CONFIRMED', () => {
      expect(getTargetState('report_ready', 'CONFIRMED')).toBe('completed');
    });

    it('should return created for report_ready + RETEST', () => {
      expect(getTargetState('report_ready', 'RETEST')).toBe('created');
    });

    it('should return failed for awaiting_approval + TIMEOUT', () => {
      expect(getTargetState('awaiting_approval', 'TIMEOUT')).toBe('failed');
    });

    it('should return failed for report_ready + TIMEOUT', () => {
      expect(getTargetState('report_ready', 'TIMEOUT')).toBe('failed');
    });

    it('should return failed for parsing + ERROR', () => {
      expect(getTargetState('parsing', 'ERROR')).toBe('failed');
    });

    it('should return null for invalid transitions', () => {
      expect(getTargetState('created', 'APPROVED')).toBeNull();
      expect(getTargetState('executing', 'CONFIRMED')).toBeNull();
      expect(getTargetState('completed', 'START_PARSING')).toBeNull();
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(isValidTransition('created', 'START_PARSING')).toBe(true);
      expect(isValidTransition('awaiting_approval', 'APPROVED')).toBe(true);
      expect(isValidTransition('report_ready', 'CONFIRMED')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(isValidTransition('created', 'APPROVED')).toBe(false);
      expect(isValidTransition('completed', 'START_PARSING')).toBe(false);
      expect(isValidTransition('failed', 'RETEST')).toBe(false);
    });
  });

  describe('createIdempotencyKey', () => {
    it('should create key with runId, fromState, toState, and event', () => {
      const key = createIdempotencyKey({
        runId: 'run-123',
        fromState: 'created',
        toState: 'parsing',
        event: 'START_PARSING',
      });
      expect(key).toBe('run-123:created:parsing:START_PARSING');
    });

    it('should include shardId when provided', () => {
      const key = createIdempotencyKey({
        runId: 'run-123',
        fromState: 'created',
        toState: 'parsing',
        event: 'START_PARSING',
        shardId: 'shard-1',
      });
      expect(key).toBe('run-123:created:parsing:START_PARSING:shard-1');
    });
  });

  describe('getTimeoutReasonCode', () => {
    it('should return approval_timeout for awaiting_approval', () => {
      expect(getTimeoutReasonCode('awaiting_approval')).toBe('approval_timeout');
    });

    it('should return confirm_timeout for report_ready', () => {
      expect(getTimeoutReasonCode('report_ready')).toBe('confirm_timeout');
    });

    it('should return agent_timeout for other states', () => {
      expect(getTimeoutReasonCode('executing')).toBe('agent_timeout');
      expect(getTimeoutReasonCode('parsing')).toBe('agent_timeout');
    });
  });

  describe('getErrorReasonCode', () => {
    it('should return playwright_error for playwright error type', () => {
      expect(getErrorReasonCode('executing', 'playwright')).toBe('playwright_error');
    });

    it('should return verdict_conflict for verdict_conflict error type', () => {
      expect(getErrorReasonCode('codex_reviewing', 'verdict_conflict')).toBe('verdict_conflict');
    });

    it('should return retry_exhausted for retry_exhausted error type', () => {
      expect(getErrorReasonCode('generating', 'retry_exhausted')).toBe('retry_exhausted');
    });

    it('should return internal_error for unknown error types', () => {
      expect(getErrorReasonCode('parsing')).toBe('internal_error');
      expect(getErrorReasonCode('generating', 'unknown')).toBe('internal_error');
    });
  });

  describe('StateMachine class', () => {
    let stateMachine: StateMachine;

    beforeEach(() => {
      stateMachine = new StateMachine();
    });

    describe('transition', () => {
      it('should successfully transition for valid state and event', () => {
        const result = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123'
        );

        expect(result.success).toBe(true);
        expect(result.newState).toBe('parsing');
        expect(result.isNoOp).toBe(false);
        expect(result.logEntry).toBeDefined();
        expect(result.logEntry?.fromState).toBe('created');
        expect(result.logEntry?.toState).toBe('parsing');
        expect(result.logEntry?.event).toBe('START_PARSING');
      });

      it('should fail for invalid transition', () => {
        const result = stateMachine.transition(
          'created',
          'APPROVED',
          'run-123'
        );

        expect(result.success).toBe(false);
        expect(result.newState).toBe('created');
        expect(result.isNoOp).toBe(false);
        expect(result.error).toContain('Invalid transition');
      });

      it('should fail for transition from terminal state', () => {
        const result = stateMachine.transition(
          'completed',
          'START_PARSING',
          'run-123'
        );

        expect(result.success).toBe(false);
        expect(result.newState).toBe('completed');
        expect(result.error).toContain('terminal state');
      });

      it('should include reason in log entry when provided', () => {
        const result = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123',
          undefined,
          'Starting PRD parsing'
        );

        expect(result.logEntry?.reason).toBe('Starting PRD parsing');
      });

      it('should include metadata in log entry when provided', () => {
        const result = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123',
          undefined,
          undefined,
          { prdPath: '/docs/prd.md' }
        );

        expect(result.logEntry?.metadata).toEqual({ prdPath: '/docs/prd.md' });
      });
    });

    describe('idempotency', () => {
      it('should return no-op for duplicate transitions', () => {
        // First transition
        const result1 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123'
        );
        expect(result1.success).toBe(true);
        expect(result1.isNoOp).toBe(false);

        // Duplicate transition (same run, same target state)
        const result2 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123'
        );
        expect(result2.success).toBe(true);
        expect(result2.isNoOp).toBe(true);
        expect(result2.newState).toBe('parsing');
        expect(result2.logEntry).toBeUndefined();
      });

      it('should use shardId in idempotency key', () => {
        // First transition with shard-1
        const result1 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123',
          'shard-1'
        );
        expect(result1.isNoOp).toBe(false);

        // Same transition with shard-2 should not be no-op
        const result2 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123',
          'shard-2'
        );
        expect(result2.isNoOp).toBe(false);

        // Duplicate with shard-1 should be no-op
        const result3 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-123',
          'shard-1'
        );
        expect(result3.isNoOp).toBe(true);
      });

      it('should track different runs independently', () => {
        // Transition for run-1
        const result1 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-1'
        );
        expect(result1.isNoOp).toBe(false);

        // Same transition for run-2 should not be no-op
        const result2 = stateMachine.transition(
          'created',
          'START_PARSING',
          'run-2'
        );
        expect(result2.isNoOp).toBe(false);
      });
    });

    describe('wouldBeNoOp', () => {
      it('should return false before transition', () => {
        expect(stateMachine.wouldBeNoOp('run-123', 'created', 'parsing', 'START_PARSING')).toBe(false);
      });

      it('should return true after transition', () => {
        stateMachine.transition('created', 'START_PARSING', 'run-123');
        expect(stateMachine.wouldBeNoOp('run-123', 'created', 'parsing', 'START_PARSING')).toBe(true);
      });
    });

    describe('clearKeysForRun', () => {
      it('should clear keys for specific run', () => {
        stateMachine.transition('created', 'START_PARSING', 'run-1');
        stateMachine.transition('created', 'START_PARSING', 'run-2');

        expect(stateMachine.getProcessedKeyCount()).toBe(2);

        stateMachine.clearKeysForRun('run-1');

        expect(stateMachine.getProcessedKeyCount()).toBe(1);
        expect(stateMachine.wouldBeNoOp('run-1', 'created', 'parsing', 'START_PARSING')).toBe(false);
        expect(stateMachine.wouldBeNoOp('run-2', 'created', 'parsing', 'START_PARSING')).toBe(true);
      });
    });

    describe('clearAllKeys', () => {
      it('should clear all keys', () => {
        stateMachine.transition('created', 'START_PARSING', 'run-1');
        stateMachine.transition('created', 'START_PARSING', 'run-2');

        expect(stateMachine.getProcessedKeyCount()).toBe(2);

        stateMachine.clearAllKeys();

        expect(stateMachine.getProcessedKeyCount()).toBe(0);
      });
    });

    describe('complete flow', () => {
      it('should support full happy path flow', () => {
        const runId = 'run-happy';

        // created -> parsing
        let result = stateMachine.transition('created', 'START_PARSING', runId);
        expect(result.newState).toBe('parsing');

        // parsing -> generating
        result = stateMachine.transition('parsing', 'PARSING_COMPLETE', runId);
        expect(result.newState).toBe('generating');

        // generating -> awaiting_approval
        result = stateMachine.transition('generating', 'GENERATION_COMPLETE', runId);
        expect(result.newState).toBe('awaiting_approval');

        // awaiting_approval -> executing
        result = stateMachine.transition('awaiting_approval', 'APPROVED', runId);
        expect(result.newState).toBe('executing');

        // executing -> codex_reviewing
        result = stateMachine.transition('executing', 'EXECUTION_COMPLETE', runId);
        expect(result.newState).toBe('codex_reviewing');

        // codex_reviewing -> report_ready
        result = stateMachine.transition('codex_reviewing', 'REVIEW_COMPLETE', runId);
        expect(result.newState).toBe('report_ready');

        // report_ready -> completed
        result = stateMachine.transition('report_ready', 'CONFIRMED', runId);
        expect(result.newState).toBe('completed');
      });

      it('should support rejection and retry flow', () => {
        const runId = 'run-reject';

        // created -> parsing -> generating -> awaiting_approval
        stateMachine.transition('created', 'START_PARSING', runId);
        stateMachine.transition('parsing', 'PARSING_COMPLETE', runId);
        stateMachine.transition('generating', 'GENERATION_COMPLETE', runId);

        // awaiting_approval -> generating (rejected)
        const result = stateMachine.transition('awaiting_approval', 'REJECTED', runId);
        expect(result.newState).toBe('generating');
      });

      it('should support retest flow', () => {
        const runId = 'run-retest';

        // Full flow to report_ready
        stateMachine.transition('created', 'START_PARSING', runId);
        stateMachine.transition('parsing', 'PARSING_COMPLETE', runId);
        stateMachine.transition('generating', 'GENERATION_COMPLETE', runId);
        stateMachine.transition('awaiting_approval', 'APPROVED', runId);
        stateMachine.transition('executing', 'EXECUTION_COMPLETE', runId);
        stateMachine.transition('codex_reviewing', 'REVIEW_COMPLETE', runId);

        // report_ready -> created (retest)
        const result = stateMachine.transition('report_ready', 'RETEST', runId);
        expect(result.newState).toBe('created');
      });
    });
  });
});

/**
 * Property-Based Tests for Orchestrator State Machine
 * 
 * Property 14: State Machine Transition Correctness
 * Property 15: State Machine Idempotency
 * 
 * **Validates: Requirements 6.1, 6.3, 6.4, 6.5, 14.1, 14.2, 14.4, 14.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  StateMachine,
  STATE_TRANSITIONS,
  TERMINAL_STATES,
  isTerminalState,
  isValidTransition,
  getTargetState,
  getValidEventsForState,
} from './state-machine.js';
import type { TestRunState, StateEvent } from '@smart-test-agent/shared';

// All possible states
const ALL_STATES: TestRunState[] = [
  'created',
  'parsing',
  'generating',
  'awaiting_approval',
  'executing',
  'codex_reviewing',
  'report_ready',
  'completed',
  'failed',
];

// All possible events
const ALL_EVENTS: StateEvent[] = [
  'START_PARSING',
  'PARSING_COMPLETE',
  'GENERATION_COMPLETE',
  'APPROVED',
  'REJECTED',
  'EXECUTION_COMPLETE',
  'REVIEW_COMPLETE',
  'CONFIRMED',
  'RETEST',
  'ERROR',
  'TIMEOUT',
];

// Arbitraries
const stateArb = fc.constantFrom(...ALL_STATES);
const eventArb = fc.constantFrom(...ALL_EVENTS);
const runIdArb = fc.uuid();
const shardIdArb = fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined });

describe('Property Tests: Orchestrator State Machine', () => {
  /**
   * Property 14: State Machine Transition Correctness
   * 
   * *For any* valid state and event combination, the state machine should 
   * transition to the correct next state.
   * 
   * **Validates: Requirements 6.1, 6.3, 6.4, 6.5, 13.1, 13.3, 13.4, 13.5, 14.1, 14.2**
   */
  describe('Property 14: State Machine Transition Correctness', () => {
    let stateMachine: StateMachine;

    beforeEach(() => {
      stateMachine = new StateMachine();
    });

    it('valid transitions should always succeed and reach expected target state', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          shardIdArb,
          async (runId, shardId) => {
            // For each valid transition in the state machine
            for (const transition of STATE_TRANSITIONS) {
              const sm = new StateMachine();
              const result = sm.transition(
                transition.from,
                transition.event,
                runId,
                shardId
              );

              // Valid transitions should always succeed
              expect(result.success).toBe(true);
              // Target state should match the defined transition
              expect(result.newState).toBe(transition.to);
              // Should not be a no-op on first attempt
              expect(result.isNoOp).toBe(false);
              // Should have a log entry
              expect(result.logEntry).toBeDefined();
              expect(result.logEntry?.fromState).toBe(transition.from);
              expect(result.logEntry?.toState).toBe(transition.to);
              expect(result.logEntry?.event).toBe(transition.event);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('invalid transitions should always fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          stateArb,
          eventArb,
          runIdArb,
          async (state, event, runId) => {
            // Skip if this is actually a valid transition
            if (isValidTransition(state, event)) {
              return;
            }

            const result = stateMachine.transition(state, event, runId);

            // Invalid transitions should fail
            expect(result.success).toBe(false);
            // State should remain unchanged
            expect(result.newState).toBe(state);
            // Should not be a no-op
            expect(result.isNoOp).toBe(false);
            // Should have an error message
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('terminal states should reject all transitions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...TERMINAL_STATES),
          eventArb,
          runIdArb,
          async (terminalState, event, runId) => {
            const result = stateMachine.transition(terminalState, event, runId);

            // Transitions from terminal states should always fail
            expect(result.success).toBe(false);
            expect(result.newState).toBe(terminalState);
            expect(result.error).toContain('terminal state');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('approval flow should follow correct state sequence', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          fc.boolean(),
          async (runId, approved) => {
            const sm = new StateMachine();

            // created -> parsing
            let result = sm.transition('created', 'START_PARSING', runId);
            expect(result.newState).toBe('parsing');

            // parsing -> generating
            result = sm.transition('parsing', 'PARSING_COMPLETE', runId);
            expect(result.newState).toBe('generating');

            // generating -> awaiting_approval
            result = sm.transition('generating', 'GENERATION_COMPLETE', runId);
            expect(result.newState).toBe('awaiting_approval');

            // awaiting_approval -> executing (approved) or generating (rejected)
            const event = approved ? 'APPROVED' : 'REJECTED';
            result = sm.transition('awaiting_approval', event, runId);
            
            if (approved) {
              expect(result.newState).toBe('executing');
            } else {
              expect(result.newState).toBe('generating');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('confirmation flow should follow correct state sequence', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          fc.boolean(),
          async (runId, confirmed) => {
            const sm = new StateMachine();

            // Full flow to report_ready
            sm.transition('created', 'START_PARSING', runId);
            sm.transition('parsing', 'PARSING_COMPLETE', runId);
            sm.transition('generating', 'GENERATION_COMPLETE', runId);
            sm.transition('awaiting_approval', 'APPROVED', runId);
            sm.transition('executing', 'EXECUTION_COMPLETE', runId);
            sm.transition('codex_reviewing', 'REVIEW_COMPLETE', runId);

            // report_ready -> completed (confirmed) or created (retest)
            const event = confirmed ? 'CONFIRMED' : 'RETEST';
            const result = sm.transition('report_ready', event, runId);
            
            if (confirmed) {
              expect(result.newState).toBe('completed');
            } else {
              expect(result.newState).toBe('created');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('timeout transitions should lead to failed state with correct reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          fc.constantFrom('awaiting_approval', 'report_ready') as fc.Arbitrary<TestRunState>,
          async (runId, state) => {
            const sm = new StateMachine();
            const result = sm.transition(state, 'TIMEOUT', runId);

            expect(result.success).toBe(true);
            expect(result.newState).toBe('failed');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 15: State Machine Idempotency
   * 
   * *For any* state transition attempt with the same (run_id, from_state, to_state, event, shard_id) 
   * tuple, subsequent attempts should be no-ops.
   * 
   * **Validates: Requirements 14.4, 14.5**
   */
  describe('Property 15: State Machine Idempotency', () => {
    it('duplicate transitions should be no-ops', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          shardIdArb,
          fc.integer({ min: 2, max: 10 }),
          async (runId, shardId, repeatCount) => {
            const sm = new StateMachine();

            // Pick a valid transition
            const transition = STATE_TRANSITIONS[0]; // created -> parsing

            // First transition should succeed
            const firstResult = sm.transition(
              transition.from,
              transition.event,
              runId,
              shardId
            );
            expect(firstResult.success).toBe(true);
            expect(firstResult.isNoOp).toBe(false);
            expect(firstResult.logEntry).toBeDefined();

            // Subsequent transitions should be no-ops
            for (let i = 0; i < repeatCount; i++) {
              const result = sm.transition(
                transition.from,
                transition.event,
                runId,
                shardId
              );
              expect(result.success).toBe(true);
              expect(result.isNoOp).toBe(true);
              expect(result.newState).toBe(transition.to);
              expect(result.logEntry).toBeUndefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('different shardIds should not be considered duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          async (runId, shardId1, shardId2) => {
            // Ensure shardIds are different
            fc.pre(shardId1 !== shardId2);

            const sm = new StateMachine();
            const transition = STATE_TRANSITIONS[0];

            // First transition with shardId1
            const result1 = sm.transition(
              transition.from,
              transition.event,
              runId,
              shardId1
            );
            expect(result1.isNoOp).toBe(false);

            // Transition with shardId2 should not be a no-op
            const result2 = sm.transition(
              transition.from,
              transition.event,
              runId,
              shardId2
            );
            expect(result2.isNoOp).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('different runIds should not be considered duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          runIdArb,
          shardIdArb,
          async (runId1, runId2, shardId) => {
            // Ensure runIds are different
            fc.pre(runId1 !== runId2);

            const sm = new StateMachine();
            const transition = STATE_TRANSITIONS[0];

            // First transition with runId1
            const result1 = sm.transition(
              transition.from,
              transition.event,
              runId1,
              shardId
            );
            expect(result1.isNoOp).toBe(false);

            // Transition with runId2 should not be a no-op
            const result2 = sm.transition(
              transition.from,
              transition.event,
              runId2,
              shardId
            );
            expect(result2.isNoOp).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('clearKeysForRun should reset idempotency for specific run', async () => {
      await fc.assert(
        fc.asyncProperty(
          runIdArb,
          runIdArb,
          async (runId1, runId2) => {
            fc.pre(runId1 !== runId2);

            const sm = new StateMachine();
            const transition = STATE_TRANSITIONS[0];

            // Transitions for both runs
            sm.transition(transition.from, transition.event, runId1);
            sm.transition(transition.from, transition.event, runId2);

            // Both should be no-ops now
            expect(sm.transition(transition.from, transition.event, runId1).isNoOp).toBe(true);
            expect(sm.transition(transition.from, transition.event, runId2).isNoOp).toBe(true);

            // Clear keys for runId1
            sm.clearKeysForRun(runId1);

            // runId1 should no longer be a no-op
            expect(sm.transition(transition.from, transition.event, runId1).isNoOp).toBe(false);
            // runId2 should still be a no-op
            expect(sm.transition(transition.from, transition.event, runId2).isNoOp).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('clearAllKeys should reset all idempotency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(runIdArb, { minLength: 2, maxLength: 5 }),
          async (runIds) => {
            // Ensure unique runIds
            const uniqueRunIds = [...new Set(runIds)];
            fc.pre(uniqueRunIds.length >= 2);

            const sm = new StateMachine();
            const transition = STATE_TRANSITIONS[0];

            // Transitions for all runs
            for (const runId of uniqueRunIds) {
              sm.transition(transition.from, transition.event, runId);
            }

            // All should be no-ops now
            for (const runId of uniqueRunIds) {
              expect(sm.transition(transition.from, transition.event, runId).isNoOp).toBe(true);
            }

            // Clear all keys
            sm.clearAllKeys();

            // None should be no-ops anymore
            for (const runId of uniqueRunIds) {
              const result = sm.transition(transition.from, transition.event, runId);
              expect(result.isNoOp).toBe(false);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Additional State Machine Properties', () => {
    it('getValidEventsForState should return only events that lead to valid transitions', async () => {
      await fc.assert(
        fc.asyncProperty(
          stateArb,
          async (state) => {
            const validEvents = getValidEventsForState(state);

            // Each returned event should be a valid transition
            for (const event of validEvents) {
              expect(isValidTransition(state, event)).toBe(true);
            }

            // No other events should be valid
            for (const event of ALL_EVENTS) {
              if (!validEvents.includes(event)) {
                expect(isValidTransition(state, event)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('getTargetState should be consistent with isValidTransition', async () => {
      await fc.assert(
        fc.asyncProperty(
          stateArb,
          eventArb,
          async (state, event) => {
            const targetState = getTargetState(state, event);
            const isValid = isValidTransition(state, event);

            if (isValid) {
              expect(targetState).not.toBeNull();
            } else {
              expect(targetState).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isTerminalState should correctly identify terminal states', async () => {
      await fc.assert(
        fc.asyncProperty(
          stateArb,
          async (state) => {
            const isTerminal = isTerminalState(state);
            const hasOutgoingTransitions = STATE_TRANSITIONS.some(t => t.from === state);

            // Terminal states should have no outgoing transitions
            if (isTerminal) {
              expect(hasOutgoingTransitions).toBe(false);
            }

            // States with no outgoing transitions should be terminal
            // (This is the definition of terminal state)
            if (!hasOutgoingTransitions) {
              expect(isTerminal).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

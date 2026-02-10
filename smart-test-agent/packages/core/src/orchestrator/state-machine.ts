/**
 * State Machine Core Logic
 * Implements the 8-state test run state machine with transitions and idempotency
 * 
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.4, 14.5
 */

import type {
  TestRunState,
  StateEvent,
  ReasonCode,
  DecisionLogEntry,
} from '@smart-test-agent/shared';

/**
 * State transition definition
 */
export interface StateTransition {
  /** Source state */
  from: TestRunState;
  /** Target state */
  to: TestRunState;
  /** Event that triggers this transition */
  event: StateEvent;
}

/**
 * Transition result
 */
export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** New state after transition (or current state if no-op) */
  newState: TestRunState;
  /** Whether this was a no-op (idempotent duplicate) */
  isNoOp: boolean;
  /** Error message if transition failed */
  error?: string;
  /** Decision log entry for this transition */
  logEntry?: DecisionLogEntry;
}

/**
 * Valid state transitions map
 * Defines all legal state transitions in the state machine
 */
export const STATE_TRANSITIONS: StateTransition[] = [
  // Normal flow transitions
  { from: 'created', to: 'parsing', event: 'START_PARSING' },
  { from: 'parsing', to: 'generating', event: 'PARSING_COMPLETE' },
  { from: 'generating', to: 'awaiting_approval', event: 'GENERATION_COMPLETE' },
  { from: 'awaiting_approval', to: 'executing', event: 'APPROVED' },
  { from: 'awaiting_approval', to: 'generating', event: 'REJECTED' },
  { from: 'executing', to: 'codex_reviewing', event: 'EXECUTION_COMPLETE' },
  { from: 'codex_reviewing', to: 'report_ready', event: 'REVIEW_COMPLETE' },
  { from: 'report_ready', to: 'completed', event: 'CONFIRMED' },
  { from: 'report_ready', to: 'created', event: 'RETEST' },
  
  // Error transitions - any non-terminal state can transition to failed
  { from: 'parsing', to: 'failed', event: 'ERROR' },
  { from: 'generating', to: 'failed', event: 'ERROR' },
  { from: 'executing', to: 'failed', event: 'ERROR' },
  { from: 'codex_reviewing', to: 'failed', event: 'ERROR' },
  
  // Timeout transitions
  { from: 'awaiting_approval', to: 'failed', event: 'TIMEOUT' },
  { from: 'report_ready', to: 'failed', event: 'TIMEOUT' },
];

/**
 * Terminal states that cannot transition to any other state
 */
export const TERMINAL_STATES: TestRunState[] = ['completed', 'failed'];

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: TestRunState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Get all valid events for a given state
 */
export function getValidEventsForState(state: TestRunState): StateEvent[] {
  return STATE_TRANSITIONS
    .filter(t => t.from === state)
    .map(t => t.event);
}

/**
 * Get the target state for a given state and event combination
 * Returns null if the transition is not valid
 */
export function getTargetState(
  currentState: TestRunState,
  event: StateEvent
): TestRunState | null {
  const transition = STATE_TRANSITIONS.find(
    t => t.from === currentState && t.event === event
  );
  return transition?.to ?? null;
}

/**
 * Check if a transition is valid
 */
export function isValidTransition(
  currentState: TestRunState,
  event: StateEvent
): boolean {
  return getTargetState(currentState, event) !== null;
}

/**
 * Idempotency key for state transitions
 * Used to detect and handle duplicate transition attempts
 */
export interface IdempotencyKey {
  runId: string;
  fromState: TestRunState;
  toState: TestRunState;
  event: StateEvent;
  shardId?: string;
}

/**
 * Create an idempotency key string
 */
export function createIdempotencyKey(key: IdempotencyKey): string {
  const parts = [key.runId, key.fromState, key.toState, key.event];
  if (key.shardId) {
    parts.push(key.shardId);
  }
  return parts.join(':');
}

/**
 * State Machine class
 * Manages state transitions with idempotency guarantees
 */
export class StateMachine {
  /** Set of processed idempotency keys */
  private processedKeys: Set<string> = new Set();

  /**
   * Attempt a state transition
   * 
   * @param currentState - Current state of the test run
   * @param event - Event triggering the transition
   * @param runId - Test run ID
   * @param shardId - Optional shard ID for idempotency
   * @param reason - Optional reason for the transition
   * @param metadata - Optional additional metadata
   * @returns TransitionResult with the outcome
   */
  transition(
    currentState: TestRunState,
    event: StateEvent,
    runId: string,
    shardId?: string,
    reason?: string,
    metadata?: Record<string, unknown>
  ): TransitionResult {
    // Check if this is a terminal state
    if (isTerminalState(currentState)) {
      return {
        success: false,
        newState: currentState,
        isNoOp: false,
        error: `Cannot transition from terminal state: ${currentState}`,
      };
    }

    // Get the target state
    const targetState = getTargetState(currentState, event);
    if (targetState === null) {
      return {
        success: false,
        newState: currentState,
        isNoOp: false,
        error: `Invalid transition: ${currentState} + ${event}`,
      };
    }

    // Check idempotency
    const idempotencyKey = createIdempotencyKey({
      runId,
      fromState: currentState,
      toState: targetState,
      event,
      shardId,
    });

    if (this.processedKeys.has(idempotencyKey)) {
      // This is a duplicate transition - return no-op
      return {
        success: true,
        newState: targetState,
        isNoOp: true,
      };
    }

    // Record the idempotency key
    this.processedKeys.add(idempotencyKey);

    // Create decision log entry
    const logEntry: DecisionLogEntry = {
      timestamp: new Date().toISOString(),
      fromState: currentState,
      toState: targetState,
      event,
      reason,
      metadata,
    };

    return {
      success: true,
      newState: targetState,
      isNoOp: false,
      logEntry,
    };
  }

  /**
   * Check if a transition would be a no-op (already processed)
   */
  wouldBeNoOp(
    runId: string,
    fromState: TestRunState,
    toState: TestRunState,
    event: StateEvent,
    shardId?: string
  ): boolean {
    const key = createIdempotencyKey({ runId, fromState, toState, event, shardId });
    return this.processedKeys.has(key);
  }

  /**
   * Clear idempotency keys for a specific run
   * Useful for testing or when a run is reset
   */
  clearKeysForRun(runId: string): void {
    const keysToRemove: string[] = [];
    for (const key of this.processedKeys) {
      if (key.startsWith(`${runId}:`)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      this.processedKeys.delete(key);
    }
  }

  /**
   * Clear all idempotency keys
   * Useful for testing
   */
  clearAllKeys(): void {
    this.processedKeys.clear();
  }

  /**
   * Get the count of processed keys
   * Useful for testing
   */
  getProcessedKeyCount(): number {
    return this.processedKeys.size;
  }
}

/**
 * Map timeout events to reason codes
 */
export function getTimeoutReasonCode(fromState: TestRunState): ReasonCode {
  switch (fromState) {
    case 'awaiting_approval':
      return 'approval_timeout';
    case 'report_ready':
      return 'confirm_timeout';
    default:
      return 'agent_timeout';
  }
}

/**
 * Map error events to reason codes based on context
 */
export function getErrorReasonCode(
  fromState: TestRunState,
  errorType?: string
): ReasonCode {
  if (errorType === 'playwright') {
    return 'playwright_error';
  }
  if (errorType === 'verdict_conflict') {
    return 'verdict_conflict';
  }
  if (errorType === 'retry_exhausted') {
    return 'retry_exhausted';
  }
  if (errorType === 'agent_timeout') {
    return 'agent_timeout';
  }
  return 'internal_error';
}

/**
 * WebSocket Events Property Tests
 * Property-based tests for WebSocket event structure and mapping
 * **Property 36: WebSocket Event Structure and Mapping**
 * **Validates: Requirements 16.2, 16.3, 16.4, 16.5, 16.6, 16.7**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  WebSocketEventEmitter,
  WebSocketEvents,
  type StateTransitionEvent,
  type StepCompletedEvent,
  type StepScreenshotEvent,
  type ProgressUpdateEvent,
  type TestCaseStartedEvent,
  type TestCaseCompletedEvent,
  type AssertionResultEvent,
  type ErrorEvent,
} from './events.js';

// ============================================================================
// Arbitraries for Event Generation
// ============================================================================

const runIdArb = fc.uuid();
const timestampArb = fc.date().map(d => d.toISOString());

const testRunStateArb = fc.constantFrom(
  'created',
  'parsing',
  'generating',
  'awaiting_approval',
  'executing',
  'codex_reviewing',
  'report_ready',
  'completed',
  'failed'
);

const reasonCodeArb = fc.constantFrom(
  'retry_exhausted',
  'agent_timeout',
  'approval_timeout',
  'confirm_timeout',
  'verdict_conflict',
  'playwright_error',
  'internal_error',
  undefined
);

const stepTypeArb = fc.constantFrom('navigation', 'action', 'assertion', 'screenshot');
const stepStatusArb = fc.constantFrom('passed', 'failed', 'skipped', 'error');
const phaseArb = fc.constantFrom('parsing', 'generating', 'executing', 'reviewing', 'reporting');
const verdictArb = fc.constantFrom('pass', 'fail', 'error');
const testStatusArb = fc.constantFrom('passed', 'failed', 'error');

const stateTransitionEventArb: fc.Arbitrary<StateTransitionEvent> = fc.record({
  runId: runIdArb,
  previousState: testRunStateArb,
  currentState: testRunStateArb,
  reasonCode: reasonCodeArb,
  timestamp: timestampArb,
});

const stepCompletedEventArb: fc.Arbitrary<StepCompletedEvent> = fc.record({
  runId: runIdArb,
  stepIndex: fc.nat({ max: 100 }),
  stepId: fc.string({ minLength: 1, maxLength: 50 }),
  stepType: stepTypeArb,
  status: stepStatusArb,
  duration: fc.nat({ max: 60000 }),
  completedSteps: fc.nat({ max: 100 }),
  totalSteps: fc.nat({ max: 100 }),
  timestamp: timestampArb,
});

const stepScreenshotEventArb: fc.Arbitrary<StepScreenshotEvent> = fc.record({
  runId: runIdArb,
  stepId: fc.string({ minLength: 1, maxLength: 50 }),
  screenshotPath: fc.string({ minLength: 1, maxLength: 200 }),
  screenshotUrl: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: timestampArb,
});

const progressUpdateEventArb: fc.Arbitrary<ProgressUpdateEvent> = fc.record({
  runId: runIdArb,
  phase: phaseArb,
  progress: fc.integer({ min: 0, max: 100 }),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: timestampArb,
});

const testCaseStartedEventArb: fc.Arbitrary<TestCaseStartedEvent> = fc.record({
  runId: runIdArb,
  caseId: fc.string({ minLength: 1, maxLength: 20 }),
  caseTitle: fc.string({ minLength: 1, maxLength: 100 }),
  route: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: timestampArb,
});

const testCaseCompletedEventArb: fc.Arbitrary<TestCaseCompletedEvent> = fc.record({
  runId: runIdArb,
  caseId: fc.string({ minLength: 1, maxLength: 20 }),
  status: testStatusArb,
  assertionsPassed: fc.nat({ max: 50 }),
  assertionsFailed: fc.nat({ max: 50 }),
  duration: fc.nat({ max: 60000 }),
  timestamp: timestampArb,
});

const assertionResultEventArb: fc.Arbitrary<AssertionResultEvent> = fc.record({
  runId: runIdArb,
  caseId: fc.string({ minLength: 1, maxLength: 20 }),
  assertionId: fc.string({ minLength: 1, maxLength: 20 }),
  type: fc.string({ minLength: 1, maxLength: 30 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  expected: fc.string({ minLength: 1, maxLength: 100 }),
  actual: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  verdict: verdictArb,
  screenshotPath: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  timestamp: timestampArb,
});

const errorEventArb: fc.Arbitrary<ErrorEvent> = fc.record({
  runId: runIdArb,
  errorCode: fc.string({ minLength: 1, maxLength: 50 }),
  errorMessage: fc.string({ minLength: 1, maxLength: 500 }),
  recoverable: fc.boolean(),
  timestamp: timestampArb,
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 36: WebSocket Event Structure and Mapping', () => {
  /**
   * Helper to create mock IO and emitter
   */
  const createTestEmitter = () => {
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    const mockIO = {
      to: toFn,
      emit: vi.fn(),
      sockets: { adapter: { rooms: new Map() } },
    };
    const emitter = new WebSocketEventEmitter(mockIO as any);
    return { emitter, mockIO, emitFn, toFn };
  };

  describe('State Transition Events', () => {
    it('should emit state_transition events to correct room with valid structure', () => {
      fc.assert(
        fc.property(stateTransitionEventArb, (event) => {
          const { emitter, toFn, emitFn } = createTestEmitter();

          emitter.emitStateTransition(event);

          // Verify room targeting
          expect(toFn).toHaveBeenCalledWith(`run:${event.runId}`);

          // Verify event name
          expect(emitFn).toHaveBeenCalledWith(
            WebSocketEvents.STATE_TRANSITION,
            expect.any(Object)
          );

          // Verify event structure
          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.runId).toBe(event.runId);
          expect(emittedEvent.previousState).toBe(event.previousState);
          expect(emittedEvent.currentState).toBe(event.currentState);
          expect(emittedEvent.timestamp).toBe(event.timestamp);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Step Completed Events', () => {
    it('should emit step_completed events with progress tracking', () => {
      fc.assert(
        fc.property(stepCompletedEventArb, (event) => {
          const { emitter, toFn, emitFn } = createTestEmitter();

          emitter.emitStepCompleted(event);

          // Verify room targeting
          expect(toFn).toHaveBeenCalledWith(`run:${event.runId}`);

          // Verify event name
          expect(emitFn).toHaveBeenCalledWith(
            WebSocketEvents.STEP_COMPLETED,
            expect.any(Object)
          );

          // Verify event structure contains progress info
          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.completedSteps).toBeDefined();
          expect(emittedEvent.totalSteps).toBeDefined();
          expect(emittedEvent.stepIndex).toBeDefined();
          expect(emittedEvent.status).toBeDefined();

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Step Screenshot Events', () => {
    it('should emit step_screenshot events with valid paths', () => {
      fc.assert(
        fc.property(stepScreenshotEventArb, (event) => {
          const { emitter, toFn, emitFn } = createTestEmitter();

          emitter.emitStepScreenshot(event);

          // Verify room targeting
          expect(toFn).toHaveBeenCalledWith(`run:${event.runId}`);

          // Verify event name
          expect(emitFn).toHaveBeenCalledWith(
            WebSocketEvents.STEP_SCREENSHOT,
            expect.any(Object)
          );

          // Verify event structure contains paths
          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.screenshotPath).toBeDefined();
          expect(emittedEvent.screenshotUrl).toBeDefined();

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Progress Update Events', () => {
    it('should emit progress_update events with valid progress values', () => {
      fc.assert(
        fc.property(progressUpdateEventArb, (event) => {
          const { emitter, toFn, emitFn } = createTestEmitter();

          emitter.emitProgressUpdate(event);

          // Verify room targeting
          expect(toFn).toHaveBeenCalledWith(`run:${event.runId}`);

          // Verify event name
          expect(emitFn).toHaveBeenCalledWith(
            WebSocketEvents.PROGRESS_UPDATE,
            expect.any(Object)
          );

          // Verify progress is within valid range
          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.progress).toBeGreaterThanOrEqual(0);
          expect(emittedEvent.progress).toBeLessThanOrEqual(100);
          expect(emittedEvent.phase).toBeDefined();
          expect(emittedEvent.message).toBeDefined();

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Test Case Events', () => {
    it('should emit test_case_started events with required fields', () => {
      fc.assert(
        fc.property(testCaseStartedEventArb, (event) => {
          const { emitter, emitFn } = createTestEmitter();

          emitter.emitTestCaseStarted(event);

          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.caseId).toBeDefined();
          expect(emittedEvent.caseTitle).toBeDefined();
          expect(emittedEvent.route).toBeDefined();

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should emit test_case_completed events with assertion counts', () => {
      fc.assert(
        fc.property(testCaseCompletedEventArb, (event) => {
          const { emitter, emitFn } = createTestEmitter();

          emitter.emitTestCaseCompleted(event);

          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.assertionsPassed).toBeDefined();
          expect(emittedEvent.assertionsFailed).toBeDefined();
          expect(emittedEvent.status).toBeDefined();
          expect(emittedEvent.duration).toBeDefined();

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Assertion Result Events', () => {
    it('should emit assertion_result events with verdict', () => {
      fc.assert(
        fc.property(assertionResultEventArb, (event) => {
          const { emitter, emitFn } = createTestEmitter();

          emitter.emitAssertionResult(event);

          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.assertionId).toBeDefined();
          expect(emittedEvent.verdict).toBeDefined();
          expect(['pass', 'fail', 'error']).toContain(emittedEvent.verdict);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Error Events', () => {
    it('should emit error events with error details', () => {
      fc.assert(
        fc.property(errorEventArb, (event) => {
          const { emitter, emitFn } = createTestEmitter();

          emitter.emitError(event);

          const emittedEvent = emitFn.mock.calls[0][1];
          expect(emittedEvent.errorCode).toBeDefined();
          expect(emittedEvent.errorMessage).toBeDefined();
          expect(typeof emittedEvent.recoverable).toBe('boolean');

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Room Targeting Consistency', () => {
    it('should always target room with format run:{runId}', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            stateTransitionEventArb,
            stepCompletedEventArb,
            stepScreenshotEventArb,
            progressUpdateEventArb
          ),
          (event) => {
            const { emitter, toFn } = createTestEmitter();

            // Emit based on event type
            if ('previousState' in event) {
              emitter.emitStateTransition(event as StateTransitionEvent);
            } else if ('stepIndex' in event) {
              emitter.emitStepCompleted(event as StepCompletedEvent);
            } else if ('screenshotPath' in event) {
              emitter.emitStepScreenshot(event as StepScreenshotEvent);
            } else {
              emitter.emitProgressUpdate(event as ProgressUpdateEvent);
            }

            // Verify room format
            const roomArg = toFn.mock.calls[0][0];
            expect(roomArg).toMatch(/^run:[0-9a-f-]+$/);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Timestamp Validity', () => {
    it('should preserve valid ISO timestamp format', () => {
      fc.assert(
        fc.property(stateTransitionEventArb, (event) => {
          const { emitter, emitFn } = createTestEmitter();

          emitter.emitStateTransition(event);

          const emittedEvent = emitFn.mock.calls[0][1];
          
          // Verify timestamp is valid ISO format
          const parsedDate = new Date(emittedEvent.timestamp);
          expect(parsedDate.toISOString()).toBe(emittedEvent.timestamp);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});

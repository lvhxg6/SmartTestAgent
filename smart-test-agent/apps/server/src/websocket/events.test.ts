/**
 * WebSocket Events Tests
 * Unit tests for WebSocket event emitter
 * @see Requirements 16.3, 16.4, 16.5, 16.6, 16.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WebSocketEventEmitter,
  createWebSocketEventEmitter,
  WebSocketEvents,
  type StateTransitionEvent,
  type StepCompletedEvent,
  type StepScreenshotEvent,
  type ProgressUpdateEvent,
} from './events.js';

// Mock Socket.IO server
const createMockIO = () => {
  const emitFn = vi.fn();
  const toFn = vi.fn(() => ({ emit: emitFn }));
  
  return {
    to: toFn,
    emit: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map([
          ['run:test-run-1', new Set(['socket-1', 'socket-2'])],
        ]),
      },
    },
    _emitFn: emitFn,
    _toFn: toFn,
  };
};

describe('WebSocketEventEmitter', () => {
  let mockIO: ReturnType<typeof createMockIO>;
  let emitter: WebSocketEventEmitter;

  beforeEach(() => {
    mockIO = createMockIO();
    emitter = new WebSocketEventEmitter(mockIO as any);
  });

  describe('emitStateTransition', () => {
    it('should emit state_transition event to correct room', () => {
      const event: StateTransitionEvent = {
        runId: 'test-run-1',
        previousState: 'created',
        currentState: 'parsing',
        timestamp: new Date().toISOString(),
      };

      emitter.emitStateTransition(event);

      expect(mockIO._toFn).toHaveBeenCalledWith('run:test-run-1');
      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.STATE_TRANSITION,
        event
      );
    });

    it('should include reasonCode when provided', () => {
      const event: StateTransitionEvent = {
        runId: 'test-run-1',
        previousState: 'executing',
        currentState: 'failed',
        reasonCode: 'playwright_error',
        timestamp: new Date().toISOString(),
      };

      emitter.emitStateTransition(event);

      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.STATE_TRANSITION,
        expect.objectContaining({ reasonCode: 'playwright_error' })
      );
    });
  });

  describe('emitStepCompleted', () => {
    it('should emit step_completed event with progress info', () => {
      const event: StepCompletedEvent = {
        runId: 'test-run-1',
        stepIndex: 5,
        stepId: 'step-5',
        stepType: 'action',
        status: 'passed',
        duration: 1500,
        completedSteps: 5,
        totalSteps: 10,
        timestamp: new Date().toISOString(),
      };

      emitter.emitStepCompleted(event);

      expect(mockIO._toFn).toHaveBeenCalledWith('run:test-run-1');
      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.STEP_COMPLETED,
        event
      );
    });

    it('should handle failed step status', () => {
      const event: StepCompletedEvent = {
        runId: 'test-run-1',
        stepIndex: 3,
        stepId: 'step-3',
        stepType: 'assertion',
        status: 'failed',
        duration: 500,
        completedSteps: 3,
        totalSteps: 10,
        timestamp: new Date().toISOString(),
      };

      emitter.emitStepCompleted(event);

      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.STEP_COMPLETED,
        expect.objectContaining({ status: 'failed' })
      );
    });
  });

  describe('emitStepScreenshot', () => {
    it('should emit step_screenshot event with paths', () => {
      const event: StepScreenshotEvent = {
        runId: 'test-run-1',
        stepId: 'step-5',
        screenshotPath: 'evidence/screenshots/step-5.png',
        screenshotUrl: '/workspace/test-run-1/evidence/screenshots/step-5.png',
        timestamp: new Date().toISOString(),
      };

      emitter.emitStepScreenshot(event);

      expect(mockIO._toFn).toHaveBeenCalledWith('run:test-run-1');
      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.STEP_SCREENSHOT,
        event
      );
    });
  });

  describe('emitProgressUpdate', () => {
    it('should emit progress_update event', () => {
      const event: ProgressUpdateEvent = {
        runId: 'test-run-1',
        phase: 'executing',
        progress: 50,
        message: 'Running test case 5 of 10',
        timestamp: new Date().toISOString(),
      };

      emitter.emitProgressUpdate(event);

      expect(mockIO._toFn).toHaveBeenCalledWith('run:test-run-1');
      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.PROGRESS_UPDATE,
        event
      );
    });

    it('should handle different phases', () => {
      const phases = ['parsing', 'generating', 'executing', 'reviewing', 'reporting'] as const;

      for (const phase of phases) {
        const event: ProgressUpdateEvent = {
          runId: 'test-run-1',
          phase,
          progress: 25,
          message: `Phase: ${phase}`,
          timestamp: new Date().toISOString(),
        };

        emitter.emitProgressUpdate(event);

        expect(mockIO._emitFn).toHaveBeenCalledWith(
          WebSocketEvents.PROGRESS_UPDATE,
          expect.objectContaining({ phase })
        );
      }
    });
  });

  describe('emitTestCaseStarted', () => {
    it('should emit test_case_started event', () => {
      emitter.emitTestCaseStarted({
        runId: 'test-run-1',
        caseId: 'TC-001',
        caseTitle: 'Test login functionality',
        route: '/login',
        timestamp: new Date().toISOString(),
      });

      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.TEST_CASE_STARTED,
        expect.objectContaining({
          caseId: 'TC-001',
          route: '/login',
        })
      );
    });
  });

  describe('emitTestCaseCompleted', () => {
    it('should emit test_case_completed event', () => {
      emitter.emitTestCaseCompleted({
        runId: 'test-run-1',
        caseId: 'TC-001',
        status: 'passed',
        assertionsPassed: 5,
        assertionsFailed: 0,
        duration: 3000,
        timestamp: new Date().toISOString(),
      });

      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.TEST_CASE_COMPLETED,
        expect.objectContaining({
          status: 'passed',
          assertionsPassed: 5,
        })
      );
    });
  });

  describe('emitAssertionResult', () => {
    it('should emit assertion_result event', () => {
      emitter.emitAssertionResult({
        runId: 'test-run-1',
        caseId: 'TC-001',
        assertionId: 'A-001',
        type: 'element_visible',
        description: 'Login button should be visible',
        expected: 'visible',
        actual: 'visible',
        verdict: 'pass',
        timestamp: new Date().toISOString(),
      });

      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.ASSERTION_RESULT,
        expect.objectContaining({
          assertionId: 'A-001',
          verdict: 'pass',
        })
      );
    });
  });

  describe('emitError', () => {
    it('should emit error event', () => {
      emitter.emitError({
        runId: 'test-run-1',
        errorCode: 'PLAYWRIGHT_TIMEOUT',
        errorMessage: 'Element not found within timeout',
        recoverable: false,
        timestamp: new Date().toISOString(),
      });

      expect(mockIO._emitFn).toHaveBeenCalledWith(
        WebSocketEvents.ERROR,
        expect.objectContaining({
          errorCode: 'PLAYWRIGHT_TIMEOUT',
          recoverable: false,
        })
      );
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all clients', () => {
      emitter.broadcast('custom-event', { data: 'test' });

      expect(mockIO.emit).toHaveBeenCalledWith('custom-event', { data: 'test' });
    });
  });

  describe('getRoomSize', () => {
    it('should return number of clients in room', async () => {
      const size = await emitter.getRoomSize('test-run-1');
      expect(size).toBe(2);
    });

    it('should return 0 for non-existent room', async () => {
      const size = await emitter.getRoomSize('non-existent');
      expect(size).toBe(0);
    });
  });
});

describe('createWebSocketEventEmitter', () => {
  it('should create WebSocketEventEmitter instance', () => {
    const mockIO = createMockIO();
    const emitter = createWebSocketEventEmitter(mockIO as any);

    expect(emitter).toBeInstanceOf(WebSocketEventEmitter);
  });
});

describe('WebSocketEvents', () => {
  it('should have all required event names', () => {
    expect(WebSocketEvents.STATE_TRANSITION).toBe('state_transition');
    expect(WebSocketEvents.STEP_COMPLETED).toBe('step_completed');
    expect(WebSocketEvents.STEP_SCREENSHOT).toBe('step_screenshot');
    expect(WebSocketEvents.PROGRESS_UPDATE).toBe('progress_update');
    expect(WebSocketEvents.ERROR).toBe('error');
  });
});

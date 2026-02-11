/**
 * WebSocket Event Types and Emitters
 * Defines event structures and provides helper functions for emitting events
 * @see Requirements 16.3, 16.4, 16.5, 16.6, 16.7
 */

import type { Server as SocketIOServer } from 'socket.io';

// ============================================================================
// Event Type Definitions
// ============================================================================

/**
 * State transition event payload
 * @see Requirements 16.3
 */
export interface StateTransitionEvent {
  runId: string;
  previousState: string;
  currentState: string;
  reasonCode?: string;
  timestamp: string;
}

/**
 * Step completed event payload
 * @see Requirements 16.4, 16.5
 */
export interface StepCompletedEvent {
  runId: string;
  stepIndex: number;
  stepId: string;
  stepType: 'navigation' | 'action' | 'assertion' | 'screenshot';
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  completedSteps: number;
  totalSteps: number;
  timestamp: string;
}

/**
 * Step screenshot event payload
 * @see Requirements 16.6
 */
export interface StepScreenshotEvent {
  runId: string;
  stepId: string;
  screenshotPath: string;
  screenshotUrl: string;
  timestamp: string;
}

/**
 * Test case started event payload
 */
export interface TestCaseStartedEvent {
  runId: string;
  caseId: string;
  caseTitle: string;
  route: string;
  timestamp: string;
}

/**
 * Test case completed event payload
 */
export interface TestCaseCompletedEvent {
  runId: string;
  caseId: string;
  status: 'passed' | 'failed' | 'error';
  assertionsPassed: number;
  assertionsFailed: number;
  duration: number;
  timestamp: string;
}

/**
 * Assertion result event payload
 */
export interface AssertionResultEvent {
  runId: string;
  caseId: string;
  assertionId: string;
  type: string;
  description: string;
  expected: string;
  actual?: string;
  verdict: 'pass' | 'fail' | 'error';
  screenshotPath?: string;
  timestamp: string;
}

/**
 * Progress update event payload
 * @see Requirements 16.7
 */
export interface ProgressUpdateEvent {
  runId: string;
  phase: 'parsing' | 'generating' | 'executing' | 'reviewing' | 'reporting';
  progress: number; // 0-100
  message: string;
  timestamp: string;
}

/**
 * CLI log event payload - for real-time CLI output streaming
 */
export interface CliLogEvent {
  runId: string;
  source: 'claude' | 'codex';
  type: 'stdout' | 'stderr' | 'info' | 'error';
  message: string;
  timestamp: string;
}

/**
 * Error event payload
 */
export interface ErrorEvent {
  runId: string;
  errorCode: string;
  errorMessage: string;
  recoverable: boolean;
  timestamp: string;
}

// ============================================================================
// Event Names
// ============================================================================

export const WebSocketEvents = {
  // State machine events
  STATE_TRANSITION: 'state_transition',
  
  // Execution events
  STEP_COMPLETED: 'step_completed',
  STEP_SCREENSHOT: 'step_screenshot',
  TEST_CASE_STARTED: 'test_case_started',
  TEST_CASE_COMPLETED: 'test_case_completed',
  ASSERTION_RESULT: 'assertion_result',
  
  // Progress events
  PROGRESS_UPDATE: 'progress_update',
  
  // CLI log events
  CLI_LOG: 'cli_log',
  
  // Error events
  ERROR: 'error',
  
  // Connection events (client -> server)
  JOIN_RUN: 'join-run',
  LEAVE_RUN: 'leave-run',
  
  // Connection events (server -> client)
  JOINED_RUN: 'joined-run',
} as const;

// ============================================================================
// Event Emitter Class
// ============================================================================

/**
 * WebSocket event emitter service
 * Provides type-safe methods for emitting events to test run rooms
 */
export class WebSocketEventEmitter {
  constructor(private io: SocketIOServer) {}

  /**
   * Get the room name for a test run
   */
  private getRoomName(runId: string): string {
    return `run:${runId}`;
  }

  /**
   * Emit state transition event
   * @see Requirements 16.3
   */
  emitStateTransition(event: StateTransitionEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.STATE_TRANSITION,
      event
    );
  }

  /**
   * Emit step completed event
   * @see Requirements 16.4, 16.5
   */
  emitStepCompleted(event: StepCompletedEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.STEP_COMPLETED,
      event
    );
  }

  /**
   * Emit step screenshot event
   * @see Requirements 16.6
   */
  emitStepScreenshot(event: StepScreenshotEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.STEP_SCREENSHOT,
      event
    );
  }

  /**
   * Emit test case started event
   */
  emitTestCaseStarted(event: TestCaseStartedEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.TEST_CASE_STARTED,
      event
    );
  }

  /**
   * Emit test case completed event
   */
  emitTestCaseCompleted(event: TestCaseCompletedEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.TEST_CASE_COMPLETED,
      event
    );
  }

  /**
   * Emit assertion result event
   */
  emitAssertionResult(event: AssertionResultEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.ASSERTION_RESULT,
      event
    );
  }

  /**
   * Emit progress update event
   * @see Requirements 16.7
   */
  emitProgressUpdate(event: ProgressUpdateEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.PROGRESS_UPDATE,
      event
    );
  }

  /**
   * Emit CLI log event for real-time output streaming
   */
  emitCliLog(event: CliLogEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.CLI_LOG,
      event
    );
  }

  /**
   * Emit error event
   */
  emitError(event: ErrorEvent): void {
    this.io.to(this.getRoomName(event.runId)).emit(
      WebSocketEvents.ERROR,
      event
    );
  }

  /**
   * Broadcast to all connected clients (not room-specific)
   */
  broadcast(eventName: string, data: any): void {
    this.io.emit(eventName, data);
  }

  /**
   * Get number of clients in a room
   */
  async getRoomSize(runId: string): Promise<number> {
    const room = this.io.sockets.adapter.rooms.get(this.getRoomName(runId));
    return room?.size || 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a WebSocket event emitter instance
 */
export function createWebSocketEventEmitter(io: SocketIOServer): WebSocketEventEmitter {
  return new WebSocketEventEmitter(io);
}

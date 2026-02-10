/**
 * WebSocket Module Index
 * Exports WebSocket event types and emitter
 */

export {
  WebSocketEventEmitter,
  createWebSocketEventEmitter,
  WebSocketEvents,
  type StateTransitionEvent,
  type StepCompletedEvent,
  type StepScreenshotEvent,
  type TestCaseStartedEvent,
  type TestCaseCompletedEvent,
  type AssertionResultEvent,
  type ProgressUpdateEvent,
  type ErrorEvent,
} from './events.js';

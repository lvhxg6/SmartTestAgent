/**
 * Socket.IO Client Configuration
 * Sets up WebSocket connection for real-time updates
 */

import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from './trpc';

let socket: Socket | null = null;

/**
 * Get or create Socket.IO connection
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(getApiBaseUrl(), {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

/**
 * Connect to WebSocket server
 */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

/**
 * Disconnect from WebSocket server
 */
export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

/**
 * Join a test run room for real-time updates
 */
export function joinTestRun(runId: string): void {
  const s = getSocket();
  s.emit('join-run', runId);
}

/**
 * Leave a test run room
 */
export function leaveTestRun(runId: string): void {
  const s = getSocket();
  s.emit('leave-run', runId);
}

/**
 * WebSocket event types
 */
export const SocketEvents = {
  STATE_TRANSITION: 'state_transition',
  STEP_COMPLETED: 'step_completed',
  STEP_SCREENSHOT: 'step_screenshot',
  PROGRESS_UPDATE: 'progress_update',
  CLI_LOG: 'cli_log',
  ERROR: 'error',
  JOINED_RUN: 'joined-run',
} as const;

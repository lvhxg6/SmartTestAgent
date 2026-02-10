/**
 * Health Router Tests
 * Unit tests for health check endpoints
 * @see Requirements 17.1
 */

import { describe, it, expect } from 'vitest';
import { healthRouter } from './health.js';
import { createCallerFactory } from '../trpc.js';

// Create a caller for testing
const createCaller = createCallerFactory(healthRouter);

describe('Health Router', () => {
  describe('check', () => {
    it('should return ok status', async () => {
      const caller = createCaller({} as any);
      const result = await caller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.services).toEqual({
        database: 'ok',
        websocket: 'ok',
      });
    });

    it('should return valid ISO timestamp', async () => {
      const caller = createCaller({} as any);
      const result = await caller.check();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  describe('ping', () => {
    it('should return pong true', async () => {
      const caller = createCaller({} as any);
      const result = await caller.ping();

      expect(result.pong).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should return valid ISO timestamp', async () => {
      const caller = createCaller({} as any);
      const result = await caller.ping();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });
});

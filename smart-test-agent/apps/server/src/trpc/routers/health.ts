/**
 * Health Check Router
 * Provides health check endpoints for the API
 * @see Requirements 17.1
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';

/**
 * Health status response schema
 */
const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string(),
  version: z.string(),
  uptime: z.number(),
  services: z.object({
    database: z.enum(['ok', 'error']),
    websocket: z.enum(['ok', 'error']),
  }),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

const startTime = Date.now();

/**
 * Health router with check and ping endpoints
 */
export const healthRouter = router({
  /**
   * Basic health check
   */
  check: publicProcedure.query((): HealthStatus => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      services: {
        database: 'ok', // TODO: Add actual database health check
        websocket: 'ok', // TODO: Add actual WebSocket health check
      },
    };
  }),

  /**
   * Simple ping endpoint
   */
  ping: publicProcedure.query(() => {
    return { pong: true, timestamp: new Date().toISOString() };
  }),
});

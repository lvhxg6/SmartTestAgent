/**
 * tRPC Routers Index
 * Combines all routers into the main app router
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

import { router } from '../trpc.js';
import { healthRouter } from './health.js';
import { projectRouter } from './project.js';
import { targetProfileRouter } from './targetProfile.js';
import { testRunRouter } from './testRun.js';
import { reportRouter } from './report.js';

/**
 * Main application router
 * Combines all sub-routers
 */
export const appRouter = router({
  /** Health check endpoints */
  health: healthRouter,
  /** Project management endpoints */
  project: projectRouter,
  /** Target profile configuration endpoints */
  targetProfile: targetProfileRouter,
  /** Test run management endpoints */
  testRun: testRunRouter,
  /** Report viewing endpoints */
  report: reportRouter,
});

/**
 * Export type for client usage
 */
export type AppRouter = typeof appRouter;

/**
 * Re-export individual routers for testing
 */
export { healthRouter } from './health.js';
export { projectRouter } from './project.js';
export { targetProfileRouter } from './targetProfile.js';
export { testRunRouter } from './testRun.js';
export { reportRouter } from './report.js';

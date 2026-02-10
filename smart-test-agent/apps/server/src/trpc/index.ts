/**
 * tRPC Module Index
 * Exports all tRPC-related modules
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

// Export tRPC instance and helpers
export { router, publicProcedure, loggedProcedure, middleware, createCallerFactory } from './trpc.js';

// Export context
export { createContext, createContextFactory, type Context } from './context.js';

// Export routers
export { appRouter, type AppRouter } from './routers/index.js';
export { healthRouter } from './routers/health.js';
export { projectRouter } from './routers/project.js';
export { targetProfileRouter } from './routers/targetProfile.js';
export { testRunRouter } from './routers/testRun.js';
export { reportRouter } from './routers/report.js';

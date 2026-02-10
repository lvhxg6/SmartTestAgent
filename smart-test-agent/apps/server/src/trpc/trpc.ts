/**
 * tRPC Instance Configuration
 * Initializes tRPC with context and middleware
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

/**
 * Initialize tRPC with context type
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Add custom error data if needed
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof Error
            ? error.cause.message
            : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * Logging middleware for debugging
 */
export const loggerMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;

  if (result.ok) {
    console.log(`[tRPC] ${type} ${path} - OK (${durationMs}ms)`);
  } else {
    console.error(`[tRPC] ${type} ${path} - ERROR (${durationMs}ms)`);
  }

  return result;
});

/**
 * Procedure with logging
 * Note: We use typeof to avoid type inference issues with complex tRPC types
 */
export const loggedProcedure = publicProcedure.use(loggerMiddleware) as typeof publicProcedure;

/**
 * Create caller for server-side usage
 */
export const createCallerFactory = t.createCallerFactory;

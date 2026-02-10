/**
 * tRPC Context
 * Creates the context for each tRPC request
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { Server as SocketIOServer } from 'socket.io';

/**
 * Context available to all tRPC procedures
 */
export interface Context {
  /** Express request object */
  req: CreateExpressContextOptions['req'];
  /** Express response object */
  res: CreateExpressContextOptions['res'];
  /** Socket.IO server instance for real-time updates */
  io?: SocketIOServer;
}

/**
 * Creates context for each tRPC request
 */
export function createContext(
  opts: CreateExpressContextOptions,
  io?: SocketIOServer
): Context {
  return {
    req: opts.req,
    res: opts.res,
    io,
  };
}

/**
 * Factory function to create context creator with Socket.IO instance
 */
export function createContextFactory(io: SocketIOServer) {
  return (opts: CreateExpressContextOptions): Context => createContext(opts, io);
}

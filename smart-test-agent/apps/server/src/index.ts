/**
 * Express + tRPC Server Entry Point
 * Main server application with Express middleware, tRPC router, and Socket.IO
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as trpcExpress from '@trpc/server/adapters/express';
import dotenv from 'dotenv';

import { appRouter } from './trpc/routers/index.js';
import { createContextFactory } from './trpc/context.js';
import { uploadRouter } from './routes/upload.js';

// Load environment variables
dotenv.config();

/**
 * Create and configure Express application
 */
const app: Express = express();

/**
 * Create HTTP server for both Express and Socket.IO
 */
const httpServer = createServer(app);

/**
 * Configure Socket.IO for real-time updates
 * @see Requirements 16.1, 16.2
 */
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ============================================================================
// Express Middleware Configuration
// ============================================================================

/**
 * CORS middleware
 * Allows cross-origin requests from the frontend
 */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

/**
 * JSON body parser middleware
 * Parses incoming JSON request bodies
 */
app.use(express.json({ limit: '10mb' }));

/**
 * URL-encoded body parser middleware
 * Parses URL-encoded request bodies
 */
app.use(express.urlencoded({ extended: true }));

/**
 * Request logging middleware
 * Logs all incoming requests for debugging
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// File Upload Route (mounted before tRPC)
// ============================================================================

/**
 * File upload endpoint for source code files
 * Handles multipart/form-data uploads, organized by projectId and category
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
app.use('/api/upload', uploadRouter);

// ============================================================================
// tRPC Router Configuration
// ============================================================================

/**
 * tRPC Express adapter
 * Mounts tRPC router at /trpc endpoint
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: createContextFactory(io),
    onError({ error, path }) {
      console.error(`[tRPC Error] ${path}:`, error.message);
    },
  })
);

// ============================================================================
// REST API Endpoints (Non-tRPC)
// ============================================================================

/**
 * Health check endpoint (REST)
 * Simple health check for load balancers and monitoring
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'smart-test-agent-server',
  });
});

/**
 * API info endpoint
 * Returns basic API information
 */
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    name: 'Smart Test Agent API',
    version: process.env.npm_package_version || '0.1.0',
    description: 'PRD-Based UI Testing Agent System API',
    endpoints: {
      trpc: '/trpc',
      health: '/health',
      docs: '/api/docs',
    },
  });
});

/**
 * API documentation endpoint (placeholder)
 */
app.get('/api/docs', (_req: Request, res: Response) => {
  res.json({
    message: 'API documentation coming soon',
    trpcPlayground: '/trpc-playground',
  });
});

// ============================================================================
// Static File Serving (for screenshots and reports)
// ============================================================================

/**
 * Serve static files from workspace directory
 * Used for screenshots and report assets
 * @see Requirements 7.4, 17.4
 */
app.use(
  '/workspace',
  express.static(process.env.WORKSPACE_DIR || '.ai-test-workspace', {
    maxAge: '1h',
  })
);

// ============================================================================
// Error Handling
// ============================================================================

/**
 * 404 handler
 * Catches requests to undefined routes
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

/**
 * Global error handler
 * Catches all unhandled errors
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// ============================================================================
// WebSocket Connection Handling
// ============================================================================

/**
 * Socket.IO connection handler
 * Manages real-time connections for test run updates
 * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7
 */
io.on('connection', socket => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  /**
   * Join a test run room for real-time updates
   */
  socket.on('join-run', (runId: string) => {
    socket.join(`run:${runId}`);
    console.log(`[WebSocket] Socket ${socket.id} joined run:${runId}`);

    // Send acknowledgment
    socket.emit('joined-run', { runId, timestamp: new Date().toISOString() });
  });

  /**
   * Leave a test run room
   */
  socket.on('leave-run', (runId: string) => {
    socket.leave(`run:${runId}`);
    console.log(`[WebSocket] Socket ${socket.id} left run:${runId}`);
  });

  /**
   * Handle disconnection
   */
  socket.on('disconnect', reason => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`);
  });

  /**
   * Handle errors
   */
  socket.on('error', error => {
    console.error(`[WebSocket] Socket ${socket.id} error:`, error);
  });
});

// ============================================================================
// Server Startup
// ============================================================================

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('Smart Test Agent Server');
  console.log('='.repeat(60));
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`tRPC endpoint: http://${HOST}:${PORT}/trpc`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log(`WebSocket: ws://${HOST}:${PORT}`);
  console.log('='.repeat(60));
});

// ============================================================================
// Exports
// ============================================================================

export { app, io, httpServer };
export type { AppRouter } from './trpc/routers/index.js';

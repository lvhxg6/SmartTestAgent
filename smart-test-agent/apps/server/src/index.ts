import express, { type Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes placeholder
app.get('/api', (_req, res) => {
  res.json({ message: 'Smart Test Agent API' });
});

// WebSocket connection handling
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('join-run', (runId: string) => {
    socket.join(`run:${runId}`);
    console.log(`Socket ${socket.id} joined run:${runId}`);
  });

  socket.on('leave-run', (runId: string) => {
    socket.leave(`run:${runId}`);
    console.log(`Socket ${socket.id} left run:${runId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export { app, io };

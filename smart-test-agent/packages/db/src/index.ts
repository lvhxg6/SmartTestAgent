/**
 * Database package entry point
 * Exports Prisma client and types for use across the monorepo
 */

import { PrismaClient } from '@prisma/client';

// Create a singleton Prisma client instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma client singleton instance
 * Uses global variable to prevent multiple instances during hot reload in development
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types for convenience
export { PrismaClient } from '@prisma/client';
export type {
  Project,
  TargetProfile,
  TestRun,
  Requirement,
  TestCase,
  Assertion,
} from '@prisma/client';

// Export Prisma namespace for advanced type usage
export { Prisma } from '@prisma/client';

/**
 * Disconnect Prisma client
 * Should be called when shutting down the application
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Connect Prisma client
 * Useful for explicit connection management
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
}

/**
 * Project Router
 * Handles project management operations
 * @see Requirements 17.1
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

/**
 * Project input schema for creation/update
 */
const projectInputSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  description: z.string().max(500).optional(),
});

/**
 * Project output schema
 */
const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type Project = z.infer<typeof projectSchema>;

/**
 * Project router with CRUD operations
 * Note: Database integration will be added in task 17.2
 */
export const projectRouter = router({
  /**
   * List all projects
   */
  list: publicProcedure.query(async () => {
    // TODO: Implement with Prisma in task 17.2
    return [] as Project[];
  }),

  /**
   * Get a single project by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.2
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Project with id ${input.id} not found`,
      });
    }),

  /**
   * Create a new project
   */
  create: publicProcedure
    .input(projectInputSchema)
    .mutation(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.2
      const now = new Date();
      return {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      } as Project;
    }),

  /**
   * Update an existing project
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: projectInputSchema.partial(),
      })
    )
    .mutation(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.2
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Project with id ${input.id} not found`,
      });
    }),

  /**
   * Delete a project
   */
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.2
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Project with id ${input.id} not found`,
      });
    }),
});

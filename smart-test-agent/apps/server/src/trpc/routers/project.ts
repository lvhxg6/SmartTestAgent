/**
 * Project Router
 * Handles project management operations with Prisma database integration
 * @see Requirements 17.1
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { prisma } from '@smart-test-agent/db';

/**
 * Project input schema for creation
 */
const createProjectInputSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name must be at most 100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
});

/**
 * Project input schema for update (all fields optional)
 */
const updateProjectInputSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name must be at most 100 characters').optional(),
  description: z.string().max(500, 'Description must be at most 500 characters').nullable().optional(),
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

/**
 * Project list query options
 */
const listOptionsSchema = z.object({
  /** Number of items to skip */
  skip: z.number().int().min(0).default(0),
  /** Number of items to take */
  take: z.number().int().min(1).max(100).default(20),
  /** Sort order */
  orderBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  /** Sort direction */
  orderDir: z.enum(['asc', 'desc']).default('desc'),
  /** Search query for name */
  search: z.string().optional(),
}).default({});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type Project = z.infer<typeof projectSchema>;

/**
 * Project router with CRUD operations
 * Integrates with Prisma database layer
 */
export const projectRouter = router({
  /**
   * List all projects with pagination and filtering
   */
  list: publicProcedure
    .input(listOptionsSchema)
    .query(async ({ input }) => {
      const { skip = 0, take = 20, orderBy = 'createdAt', orderDir = 'desc', search } = input;

      // Build where clause for search
      const where = search
        ? {
            name: {
              contains: search,
            },
          }
        : undefined;

      // Get total count for pagination
      const total = await prisma.project.count({ where });

      // Get projects with pagination
      const projects = await prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: {
          [orderBy]: orderDir,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        items: projects,
        total,
        skip,
        take,
        hasMore: skip + take < total,
      };
    }),

  /**
   * Get a single project by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid('Invalid project ID format') }))
    .query(async ({ input }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.id} not found`,
        });
      }

      return project;
    }),

  /**
   * Create a new project
   */
  create: publicProcedure
    .input(createProjectInputSchema)
    .mutation(async ({ input }) => {
      // Check for duplicate name
      const existing = await prisma.project.findFirst({
        where: { name: input.name },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Project with name "${input.name}" already exists`,
        });
      }

      const project = await prisma.project.create({
        data: {
          name: input.name,
          description: input.description ?? null,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return project;
    }),

  /**
   * Update an existing project
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid project ID format'),
        data: updateProjectInputSchema,
      })
    )
    .mutation(async ({ input }) => {
      // Check if project exists
      const existing = await prisma.project.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.id} not found`,
        });
      }

      // Check for duplicate name if name is being updated
      if (input.data.name && input.data.name !== existing.name) {
        const duplicate = await prisma.project.findFirst({
          where: {
            name: input.data.name,
            id: { not: input.id },
          },
        });

        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Project with name "${input.data.name}" already exists`,
          });
        }
      }

      const project = await prisma.project.update({
        where: { id: input.id },
        data: {
          ...(input.data.name !== undefined && { name: input.data.name }),
          ...(input.data.description !== undefined && { description: input.data.description }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return project;
    }),

  /**
   * Delete a project
   */
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid('Invalid project ID format') }))
    .mutation(async ({ input }) => {
      // Check if project exists
      const existing = await prisma.project.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.id} not found`,
        });
      }

      // Delete the project (cascade will handle related records)
      await prisma.project.delete({
        where: { id: input.id },
      });

      return { success: true, id: input.id };
    }),

  /**
   * Check if a project name is available
   */
  checkNameAvailable: publicProcedure
    .input(z.object({ 
      name: z.string().min(1),
      excludeId: z.string().uuid().optional(),
    }))
    .query(async ({ input }) => {
      const existing = await prisma.project.findFirst({
        where: {
          name: input.name,
          ...(input.excludeId && { id: { not: input.excludeId } }),
        },
      });

      return { available: !existing };
    }),
});

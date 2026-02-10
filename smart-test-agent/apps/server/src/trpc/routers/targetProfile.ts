/**
 * Target Profile Router
 * Handles target profile configuration operations
 * @see Requirements 1.1, 1.2, 17.1
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

/**
 * Browser config schema
 * @see Requirements 1.4, 1.5
 */
const browserConfigSchema = z.object({
  ignoreHTTPSErrors: z.boolean(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  locale: z.string(),
  timeoutMs: z.number().int().positive(),
});

/**
 * Login config schema
 * @see Requirements 1.1, 1.3
 */
const loginConfigSchema = z.object({
  loginUrl: z.string().url(),
  usernameSelector: z.string(),
  passwordSelector: z.string(),
  submitSelector: z.string(),
  credentials: z.object({
    username: z.string(),
    password: z.string(),
  }),
  successIndicator: z.string(),
  tenantValue: z.string().optional(),
  tenantAlreadySelected: z.boolean().optional(),
});

/**
 * Source code config schema
 * @see Requirements 2.1, 2.2, 2.3
 */
const sourceCodeConfigSchema = z.object({
  frontendRoot: z.string(),
  routerFile: z.string(),
  pageDir: z.string(),
  apiDir: z.string(),
});

/**
 * Ant Design quirks config schema
 * @see Requirements 1.6, 1.7
 */
const antdQuirksConfigSchema = z.object({
  buttonTextSpace: z.boolean(),
  selectType: z.enum(['custom', 'native']),
  modalCloseSelector: z.string(),
});

/**
 * Operation types
 * @see Requirements 1.9
 */
const operationTypeSchema = z.enum([
  'query',
  'view_detail',
  'search',
  'filter',
  'paginate',
  'create',
  'edit',
  'delete',
]);

/**
 * UI Framework types
 * @see Requirements 1.8
 */
const uiFrameworkSchema = z.enum(['antd', 'element-ui', 'custom']);

/**
 * Target profile input schema
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */
const targetProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  baseUrl: z.string().url('Invalid base URL'),
  browser: browserConfigSchema,
  login: loginConfigSchema,
  allowedRoutes: z.array(z.string()).min(1, 'At least one route is required'),
  deniedRoutes: z.array(z.string()).optional(),
  allowedOperations: z.array(operationTypeSchema).min(1, 'At least one operation is required'),
  deniedOperations: z.array(operationTypeSchema).optional(),
  sourceCode: sourceCodeConfigSchema,
  uiFramework: uiFrameworkSchema,
  antdQuirks: antdQuirksConfigSchema.optional(),
});

/**
 * Target profile output schema
 */
const targetProfileSchema = targetProfileInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TargetProfileInput = z.infer<typeof targetProfileInputSchema>;
export type TargetProfile = z.infer<typeof targetProfileSchema>;

/**
 * Target profile router
 * Note: Database integration will be added in task 17.3
 */
export const targetProfileRouter = router({
  /**
   * Get target profile by project ID
   */
  getByProjectId: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.3
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Target profile for project ${input.projectId} not found`,
      });
    }),

  /**
   * Create or update target profile
   */
  upsert: publicProcedure
    .input(targetProfileInputSchema)
    .mutation(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.3
      const now = new Date();
      return {
        id: crypto.randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      } as TargetProfile;
    }),

  /**
   * Validate target profile configuration
   */
  validate: publicProcedure
    .input(targetProfileInputSchema)
    .mutation(async ({ input }) => {
      // Validation is done by Zod schema
      // Additional validation logic can be added here
      const errors: string[] = [];

      // Validate URL accessibility (placeholder)
      // TODO: Add actual URL validation in task 17.3

      // Validate route format
      for (const route of input.allowedRoutes) {
        if (!route.startsWith('/')) {
          errors.push(`Route "${route}" must start with /`);
        }
      }

      // Validate antdQuirks is provided when uiFramework is 'antd'
      if (input.uiFramework === 'antd' && !input.antdQuirks) {
        errors.push('antdQuirks configuration is recommended for Ant Design framework');
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    }),

  /**
   * Delete target profile
   */
  delete: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      // TODO: Implement with Prisma in task 17.3
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Target profile for project ${input.projectId} not found`,
      });
    }),
});

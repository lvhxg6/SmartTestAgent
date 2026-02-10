/**
 * Target Profile Router
 * Handles target profile configuration operations with Prisma database integration
 * @see Requirements 1.1, 1.2, 17.1
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { prisma, toJsonString, fromJsonString, fromJsonStringNullable } from '@smart-test-agent/db';
import { TargetProfileManager, validateTargetProfile } from '@smart-test-agent/core';

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
 * Convert database record to API response format
 */
function dbToApiFormat(dbRecord: any): TargetProfile {
  const antdQuirksValue = dbRecord.antdQuirks 
    ? fromJsonString<{ buttonTextSpace: boolean; selectType: 'custom' | 'native'; modalCloseSelector: string }>(dbRecord.antdQuirks)
    : undefined;
  return {
    id: dbRecord.id,
    projectId: dbRecord.projectId,
    baseUrl: dbRecord.baseUrl,
    browser: fromJsonString(dbRecord.browserConfig),
    login: fromJsonString(dbRecord.loginConfig),
    allowedRoutes: fromJsonString(dbRecord.allowedRoutes),
    deniedRoutes: fromJsonString(dbRecord.deniedRoutes),
    allowedOperations: fromJsonString(dbRecord.allowedOperations),
    deniedOperations: fromJsonString(dbRecord.deniedOperations),
    sourceCode: fromJsonString(dbRecord.sourceCodeConfig),
    uiFramework: dbRecord.uiFramework as 'antd' | 'element-ui' | 'custom',
    antdQuirks: antdQuirksValue,
    createdAt: dbRecord.createdAt,
    updatedAt: dbRecord.updatedAt,
  };
}

/**
 * Target profile router with Prisma database integration
 */
export const targetProfileRouter = router({
  /**
   * Get target profile by project ID
   */
  getByProjectId: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ input }) => {
      // Check if project exists
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.projectId} not found`,
        });
      }

      // Get target profile
      const profile = await prisma.targetProfile.findUnique({
        where: { projectId: input.projectId },
      });

      if (!profile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Target profile for project ${input.projectId} not found`,
        });
      }

      return dbToApiFormat(profile);
    }),

  /**
   * Create or update target profile
   */
  upsert: publicProcedure
    .input(targetProfileInputSchema)
    .mutation(async ({ input }) => {
      // Check if project exists
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.projectId} not found`,
        });
      }

      // Prepare data for database
      const dbData = {
        baseUrl: input.baseUrl,
        browserConfig: toJsonString(input.browser),
        loginConfig: toJsonString(input.login),
        allowedRoutes: toJsonString(input.allowedRoutes),
        deniedRoutes: toJsonString(input.deniedRoutes ?? []),
        allowedOperations: toJsonString(input.allowedOperations),
        deniedOperations: toJsonString(input.deniedOperations ?? []),
        sourceCodeConfig: toJsonString(input.sourceCode),
        uiFramework: input.uiFramework,
        antdQuirks: input.antdQuirks ? toJsonString(input.antdQuirks) : null,
      };

      // Upsert target profile
      const profile = await prisma.targetProfile.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          ...dbData,
        },
        update: dbData,
      });

      return dbToApiFormat(profile);
    }),

  /**
   * Validate target profile configuration
   * Uses the core TargetProfileManager for validation
   */
  validate: publicProcedure
    .input(targetProfileInputSchema)
    .mutation(async ({ input }) => {
      const errors: string[] = [];

      // Validate route format
      for (const route of input.allowedRoutes) {
        if (!route.startsWith('/')) {
          errors.push(`Route "${route}" must start with /`);
        }
      }

      // Validate denied routes format if provided
      if (input.deniedRoutes) {
        for (const route of input.deniedRoutes) {
          if (!route.startsWith('/')) {
            errors.push(`Denied route "${route}" must start with /`);
          }
        }
      }

      // Validate antdQuirks is provided when uiFramework is 'antd'
      if (input.uiFramework === 'antd' && !input.antdQuirks) {
        errors.push('antdQuirks configuration is recommended for Ant Design framework');
      }

      // Validate URL format
      try {
        new URL(input.baseUrl);
      } catch {
        errors.push('Invalid base URL format');
      }

      try {
        new URL(input.login.loginUrl);
      } catch {
        errors.push('Invalid login URL format');
      }

      // Validate viewport dimensions
      if (input.browser.viewport.width < 320) {
        errors.push('Viewport width must be at least 320px');
      }
      if (input.browser.viewport.height < 240) {
        errors.push('Viewport height must be at least 240px');
      }

      // Validate timeout
      if (input.browser.timeoutMs < 1000) {
        errors.push('Timeout must be at least 1000ms');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: input.uiFramework === 'antd' && !input.antdQuirks 
          ? ['Consider providing antdQuirks configuration for better Ant Design support']
          : [],
      };
    }),

  /**
   * Delete target profile
   */
  delete: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      // Check if project exists
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project with id ${input.projectId} not found`,
        });
      }

      // Check if target profile exists
      const profile = await prisma.targetProfile.findUnique({
        where: { projectId: input.projectId },
      });

      if (!profile) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Target profile for project ${input.projectId} not found`,
        });
      }

      // Delete target profile
      await prisma.targetProfile.delete({
        where: { projectId: input.projectId },
      });

      return { success: true, projectId: input.projectId };
    }),

  /**
   * Check if target profile exists for a project
   */
  exists: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ input }) => {
      const profile = await prisma.targetProfile.findUnique({
        where: { projectId: input.projectId },
        select: { id: true },
      });

      return { exists: !!profile };
    }),
});

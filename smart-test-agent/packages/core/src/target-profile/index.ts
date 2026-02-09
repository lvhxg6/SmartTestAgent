/**
 * Target Profile Manager Module
 * Manages test target project configuration including base_url, login, routes, and UI framework settings
 * 
 * @see Requirements 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */

import {
  prisma,
  toJsonString,
  fromJsonString,
  toJsonStringNullable,
  fromJsonStringNullable,
  type TargetProfile as DbTargetProfile,
} from '@smart-test-agent/db';

import type {
  TargetProfile,
  BrowserConfig,
  LoginConfig,
  SourceCodeConfig,
  AntdQuirksConfig,
  OperationType,
  UIFramework,
} from '@smart-test-agent/shared';

// ============================================================================
// Input Types for Create/Update Operations
// ============================================================================

/**
 * Input type for creating a new Target Profile
 */
export interface CreateTargetProfileInput {
  projectId: string;
  baseUrl: string;
  browser: BrowserConfig;
  login: LoginConfig;
  allowedRoutes: string[];
  deniedRoutes?: string[];
  allowedOperations: OperationType[];
  deniedOperations?: OperationType[];
  sourceCode: SourceCodeConfig;
  uiFramework: UIFramework;
  antdQuirks?: AntdQuirksConfig;
}

/**
 * Input type for updating an existing Target Profile
 * All fields are optional except id
 */
export interface UpdateTargetProfileInput {
  baseUrl?: string;
  browser?: BrowserConfig;
  login?: LoginConfig;
  allowedRoutes?: string[];
  deniedRoutes?: string[];
  allowedOperations?: OperationType[];
  deniedOperations?: OperationType[];
  sourceCode?: SourceCodeConfig;
  uiFramework?: UIFramework;
  antdQuirks?: AntdQuirksConfig | null;
}

// ============================================================================
// TargetProfileManager Class
// ============================================================================

/**
 * TargetProfileManager - Manages Target Profile CRUD operations
 * 
 * Provides methods for:
 * - Creating new target profiles
 * - Updating existing profiles
 * - Deleting profiles
 * - Retrieving profiles by ID or project ID
 * - Converting between application and database formats
 * 
 * @see Requirements 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */
export class TargetProfileManager {
  /**
   * Create a new Target Profile
   * 
   * @param data - The profile data to create
   * @returns The created Target Profile
   * @throws Error if project doesn't exist or profile already exists for project
   * 
   * @see Requirements 1.1, 1.2
   */
  async create(data: CreateTargetProfileInput): Promise<TargetProfile> {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project) {
      throw new Error(`Project with id ${data.projectId} not found`);
    }

    // Check if profile already exists for this project
    const existingProfile = await prisma.targetProfile.findUnique({
      where: { projectId: data.projectId },
    });

    if (existingProfile) {
      throw new Error(`Target profile already exists for project ${data.projectId}`);
    }

    // Create the profile in database
    const dbProfile = await prisma.targetProfile.create({
      data: {
        projectId: data.projectId,
        baseUrl: data.baseUrl,
        browserConfig: toJsonString(data.browser),
        loginConfig: toJsonString(data.login),
        allowedRoutes: toJsonString(data.allowedRoutes),
        deniedRoutes: toJsonString(data.deniedRoutes ?? []),
        allowedOperations: toJsonString(data.allowedOperations),
        deniedOperations: toJsonString(data.deniedOperations ?? []),
        sourceCodeConfig: toJsonString(data.sourceCode),
        uiFramework: data.uiFramework,
        antdQuirks: toJsonStringNullable(data.antdQuirks),
      },
    });

    return this.fromDbFormat(dbProfile);
  }

  /**
   * Update an existing Target Profile
   * 
   * @param id - The profile ID to update
   * @param data - The fields to update
   * @returns The updated Target Profile
   * @throws Error if profile doesn't exist
   * 
   * @see Requirements 1.1, 1.2
   */
  async update(id: string, data: UpdateTargetProfileInput): Promise<TargetProfile> {
    // Check if profile exists
    const existingProfile = await prisma.targetProfile.findUnique({
      where: { id },
    });

    if (!existingProfile) {
      throw new Error(`Target profile with id ${id} not found`);
    }

    // Build update data object
    const updateData: Record<string, unknown> = {};

    if (data.baseUrl !== undefined) {
      updateData.baseUrl = data.baseUrl;
    }
    if (data.browser !== undefined) {
      updateData.browserConfig = toJsonString(data.browser);
    }
    if (data.login !== undefined) {
      updateData.loginConfig = toJsonString(data.login);
    }
    if (data.allowedRoutes !== undefined) {
      updateData.allowedRoutes = toJsonString(data.allowedRoutes);
    }
    if (data.deniedRoutes !== undefined) {
      updateData.deniedRoutes = toJsonString(data.deniedRoutes);
    }
    if (data.allowedOperations !== undefined) {
      updateData.allowedOperations = toJsonString(data.allowedOperations);
    }
    if (data.deniedOperations !== undefined) {
      updateData.deniedOperations = toJsonString(data.deniedOperations);
    }
    if (data.sourceCode !== undefined) {
      updateData.sourceCodeConfig = toJsonString(data.sourceCode);
    }
    if (data.uiFramework !== undefined) {
      updateData.uiFramework = data.uiFramework;
    }
    if (data.antdQuirks !== undefined) {
      updateData.antdQuirks = toJsonStringNullable(data.antdQuirks);
    }

    // Update the profile
    const dbProfile = await prisma.targetProfile.update({
      where: { id },
      data: updateData,
    });

    return this.fromDbFormat(dbProfile);
  }

  /**
   * Delete a Target Profile
   * 
   * @param id - The profile ID to delete
   * @throws Error if profile doesn't exist
   */
  async delete(id: string): Promise<void> {
    // Check if profile exists
    const existingProfile = await prisma.targetProfile.findUnique({
      where: { id },
    });

    if (!existingProfile) {
      throw new Error(`Target profile with id ${id} not found`);
    }

    await prisma.targetProfile.delete({
      where: { id },
    });
  }

  /**
   * Get a Target Profile by ID
   * 
   * @param id - The profile ID
   * @returns The Target Profile or null if not found
   */
  async getById(id: string): Promise<TargetProfile | null> {
    const dbProfile = await prisma.targetProfile.findUnique({
      where: { id },
    });

    if (!dbProfile) {
      return null;
    }

    return this.fromDbFormat(dbProfile);
  }

  /**
   * Get a Target Profile by Project ID
   * 
   * @param projectId - The project ID
   * @returns The Target Profile or null if not found
   */
  async getByProjectId(projectId: string): Promise<TargetProfile | null> {
    const dbProfile = await prisma.targetProfile.findUnique({
      where: { projectId },
    });

    if (!dbProfile) {
      return null;
    }

    return this.fromDbFormat(dbProfile);
  }

  /**
   * Convert a TargetProfile to database format (JSON serialization)
   * 
   * @param profile - The application TargetProfile object
   * @returns Database format object ready for Prisma
   */
  toDbFormat(profile: TargetProfile): Omit<DbTargetProfile, 'createdAt' | 'updatedAt'> {
    return {
      id: profile.id,
      projectId: profile.projectId,
      baseUrl: profile.baseUrl,
      browserConfig: toJsonString(profile.browser),
      loginConfig: toJsonString(profile.login),
      allowedRoutes: toJsonString(profile.allowedRoutes),
      deniedRoutes: toJsonString(profile.deniedRoutes ?? []),
      allowedOperations: toJsonString(profile.allowedOperations),
      deniedOperations: toJsonString(profile.deniedOperations ?? []),
      sourceCodeConfig: toJsonString(profile.sourceCode),
      uiFramework: profile.uiFramework,
      antdQuirks: toJsonStringNullable(profile.antdQuirks),
    };
  }

  /**
   * Convert from database format to TargetProfile (JSON deserialization)
   * 
   * @param dbProfile - The database record from Prisma
   * @returns Application TargetProfile object
   */
  fromDbFormat(dbProfile: DbTargetProfile): TargetProfile {
    return {
      id: dbProfile.id,
      projectId: dbProfile.projectId,
      baseUrl: dbProfile.baseUrl,
      browser: fromJsonString<BrowserConfig>(dbProfile.browserConfig),
      login: fromJsonString<LoginConfig>(dbProfile.loginConfig),
      allowedRoutes: fromJsonString<string[]>(dbProfile.allowedRoutes),
      deniedRoutes: fromJsonString<string[]>(dbProfile.deniedRoutes),
      allowedOperations: fromJsonString<OperationType[]>(dbProfile.allowedOperations),
      deniedOperations: fromJsonString<OperationType[]>(dbProfile.deniedOperations),
      sourceCode: fromJsonString<SourceCodeConfig>(dbProfile.sourceCodeConfig),
      uiFramework: dbProfile.uiFramework as UIFramework,
      antdQuirks: fromJsonStringNullable<AntdQuirksConfig>(dbProfile.antdQuirks) ?? undefined,
    };
  }
}

// Export a singleton instance for convenience
export const targetProfileManager = new TargetProfileManager();

// Re-export types for convenience
export type { TargetProfile, BrowserConfig, LoginConfig, SourceCodeConfig, AntdQuirksConfig, OperationType, UIFramework };

// Re-export environment variable resolver functions
export {
  isEnvVariable,
  extractEnvVarName,
  resolveEnvVariable,
  resolveCredentials,
  resolveLoginConfig,
  type Credentials,
} from './env-resolver.js';

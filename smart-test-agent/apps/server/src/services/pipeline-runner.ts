/**
 * Pipeline Runner Service
 * Connects test run creation with TestPipeline execution
 * Runs pipeline in background and emits WebSocket events for progress updates
 * 
 * @see Requirements 13.1, 13.2, 13.3, 14.1
 */

import { Server as SocketIOServer } from 'socket.io';
import { TestPipeline, type PipelineConfig, type PipelineResult } from '@smart-test-agent/core';
import { prisma, toJsonString, fromJsonString } from '@smart-test-agent/db';
import type { TestRunState } from '@smart-test-agent/shared';
import * as path from 'path';
import * as fs from 'fs/promises';

// State mapping from pipeline events to database states
const STEP_TO_STATE: Record<string, TestRunState> = {
  initialize: 'created',
  source_indexing: 'parsing',
  prd_parsing: 'parsing',
  test_execution: 'executing',
  codex_review: 'codex_reviewing',
  cross_validation: 'codex_reviewing',
  report_generation: 'report_ready',
  quality_gate: 'report_ready',
};

export interface PipelineRunnerConfig {
  workspaceRoot: string;
  promptsDir: string;
}

/**
 * Pipeline Runner Service
 * Manages pipeline execution and state synchronization
 */
export class PipelineRunner {
  private io: SocketIOServer | null = null;
  private config: PipelineRunnerConfig;
  private runningPipelines: Map<string, TestPipeline> = new Map();

  constructor(config: PipelineRunnerConfig) {
    this.config = config;
  }

  /**
   * Set Socket.IO server for real-time updates
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Start pipeline execution for a test run
   * This runs asynchronously in the background
   */
  async startPipeline(runId: string): Promise<void> {
    console.log(`[PipelineRunner] Starting pipeline for run: ${runId}`);

    // Get test run from database
    const testRun = await prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!testRun) {
      console.error(`[PipelineRunner] Test run not found: ${runId}`);
      return;
    }

    // Get target profile
    const targetProfile = await prisma.targetProfile.findUnique({
      where: { projectId: testRun.projectId },
    });

    if (!targetProfile) {
      console.error(`[PipelineRunner] Target profile not found for project: ${testRun.projectId}`);
      await this.updateRunState(runId, 'failed', 'internal_error', 'Target profile not found');
      return;
    }

    // Get project for PRD path resolution
    const project = await prisma.project.findUnique({
      where: { id: testRun.projectId },
    });

    if (!project) {
      console.error(`[PipelineRunner] Project not found: ${testRun.projectId}`);
      await this.updateRunState(runId, 'failed', 'internal_error', 'Project not found');
      return;
    }

    // Convert target profile to pipeline format
    const profileConfig = this.convertTargetProfile(targetProfile);

    // Resolve PRD path
    const prdPath = await this.resolvePrdPath(testRun.prdPath, testRun.projectId);

    // Create pipeline config
    const pipelineConfig: PipelineConfig = {
      projectId: testRun.projectId,
      prdPath,
      routes: fromJsonString<string[]>(testRun.testedRoutes),
      targetProfile: profileConfig,
      workspaceRoot: this.config.workspaceRoot,
      promptsDir: this.config.promptsDir,
    };

    // Create and configure pipeline
    const pipeline = new TestPipeline();
    this.runningPipelines.set(runId, pipeline);

    // Set up event handlers
    pipeline.onEvent(async (event) => {
      console.log(`[PipelineRunner] Event: ${event.type} for run ${event.runId}`, event.data);

      // Emit to WebSocket
      if (this.io) {
        this.io.to(`run:${runId}`).emit('pipeline:event', event);
      }

      // Update database state based on step
      if (event.type === 'step_started') {
        const step = event.data.step as string;
        const newState = STEP_TO_STATE[step];
        if (newState) {
          await this.updateRunState(runId, newState);
        }
      }

      if (event.type === 'step_failed') {
        const errorMsg = event.data.error as string;
        console.error(`[PipelineRunner] Step failed: ${event.data.step}`, errorMsg);
      }

      if (event.type === 'approval_required') {
        await this.updateRunState(runId, 'awaiting_approval');
        if (this.io) {
          this.io.to(`run:${runId}`).emit('approval:required', {
            runId,
            testCasesPath: event.data.testCasesPath,
          });
        }
      }

      if (event.type === 'confirmation_required') {
        await this.updateRunState(runId, 'report_ready');
        if (this.io) {
          this.io.to(`run:${runId}`).emit('confirmation:required', {
            runId,
            reportPath: event.data.reportPath,
          });
        }
      }
    });

    // Execute pipeline in background
    this.executePipelineAsync(runId, pipeline, pipelineConfig);
  }

  /**
   * Execute pipeline asynchronously
   */
  private async executePipelineAsync(
    runId: string,
    pipeline: TestPipeline,
    config: PipelineConfig
  ): Promise<void> {
    try {
      console.log(`[PipelineRunner] Executing pipeline for run: ${runId}`);
      const result = await pipeline.execute(config);

      console.log(`[PipelineRunner] Pipeline completed for run: ${runId}`, result.status);

      // Update final state
      if (result.status === 'completed') {
        await this.updateRunState(runId, 'report_ready', null, undefined, {
          reportPath: result.reportPath,
          qualityMetrics: result.qualityMetrics,
        });
      } else if (result.status === 'failed') {
        await this.updateRunState(runId, 'failed', 'internal_error', result.error);
      }

      // Emit completion event
      if (this.io) {
        this.io.to(`run:${runId}`).emit('pipeline:completed', {
          runId,
          status: result.status,
          reportPath: result.reportPath,
          qualityMetrics: result.qualityMetrics,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[PipelineRunner] Pipeline error for run ${runId}:`, errorMsg);
      await this.updateRunState(runId, 'failed', 'internal_error', errorMsg);

      if (this.io) {
        this.io.to(`run:${runId}`).emit('pipeline:error', {
          runId,
          error: errorMsg,
        });
      }
    } finally {
      this.runningPipelines.delete(runId);
    }
  }

  /**
   * Update test run state in database
   */
  private async updateRunState(
    runId: string,
    state: TestRunState,
    reasonCode?: string | null,
    errorDetails?: string,
    extras?: { reportPath?: string; qualityMetrics?: Record<string, number> }
  ): Promise<void> {
    try {
      const run = await prisma.testRun.findUnique({ where: { id: runId } });
      if (!run) return;

      // Add to decision log
      const decisionLog = fromJsonString<Array<{ timestamp: string; action: string; details?: string }>>(run.decisionLog);
      decisionLog.push({
        timestamp: new Date().toISOString(),
        action: `state_changed_to_${state}`,
        details: errorDetails,
      });

      const updateData: Record<string, unknown> = {
        state,
        decisionLog: toJsonString(decisionLog),
      };

      if (reasonCode !== undefined) {
        updateData.reasonCode = reasonCode;
      }

      if (extras?.reportPath) {
        updateData.reportPath = extras.reportPath;
      }

      if (extras?.qualityMetrics) {
        updateData.qualityMetrics = toJsonString(extras.qualityMetrics);
      }

      if (state === 'completed' || state === 'failed') {
        updateData.completedAt = new Date();
      }

      await prisma.testRun.update({
        where: { id: runId },
        data: updateData,
      });

      // Emit state change via WebSocket
      if (this.io) {
        this.io.to(`run:${runId}`).emit('state_transition', {
          runId,
          previousState: run.state,
          currentState: state,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`[PipelineRunner] Failed to update run state:`, error);
    }
  }

  /**
   * Convert database target profile to pipeline format
   */
  private convertTargetProfile(dbProfile: any): any {
    return {
      id: dbProfile.id,
      projectId: dbProfile.projectId,
      baseUrl: dbProfile.baseUrl,
      browser: fromJsonString(dbProfile.browserConfig),
      login: fromJsonString(dbProfile.loginConfig),
      allowedRoutes: fromJsonString(dbProfile.allowedRoutes),
      allowedOperations: fromJsonString(dbProfile.allowedOperations),
      deniedOperations: fromJsonString(dbProfile.deniedOperations),
      sourceCode: fromJsonString(dbProfile.sourceCodeConfig),
      uiFramework: dbProfile.uiFramework,
      antdQuirks: dbProfile.antdQuirks ? fromJsonString(dbProfile.antdQuirks) : undefined,
    };
  }

  /**
   * Resolve PRD path - check if it's a file path or needs to be found
   */
  private async resolvePrdPath(prdPath: string, projectId: string): Promise<string> {
    // If it's an absolute path, use as-is
    if (path.isAbsolute(prdPath)) {
      return prdPath;
    }

    // If it starts with docs/, use as-is
    if (prdPath.startsWith('docs/')) {
      return prdPath;
    }

    // Get the project root (3 levels up from apps/server/src)
    // Server runs from apps/server, so we need to go up to find docs/
    const serverRoot = process.cwd();
    const monorepoRoot = path.resolve(serverRoot, '..', '..'); // smart-test-agent
    const projectRoot = path.resolve(monorepoRoot, '..'); // parent of smart-test-agent

    // Check common locations in order
    const searchPaths = [
      // Direct path from server root
      path.join(serverRoot, prdPath),
      // In docs/prd directory from project root (parent of monorepo)
      path.join(projectRoot, 'docs', 'prd', prdPath),
      // In docs directory from project root
      path.join(projectRoot, 'docs', prdPath),
      // In docs/prd from monorepo root
      path.join(monorepoRoot, 'docs', 'prd', prdPath),
      // In docs from monorepo root
      path.join(monorepoRoot, 'docs', prdPath),
      // In project uploads directory
      path.join(this.config.workspaceRoot, 'uploads', projectId, prdPath),
      // In data/uploads directory
      path.join(serverRoot, 'data', 'uploads', projectId, prdPath),
    ];

    for (const searchPath of searchPaths) {
      try {
        await fs.access(searchPath);
        console.log(`[PipelineRunner] Found PRD at: ${searchPath}`);
        return searchPath;
      } catch {
        // Continue to next path
      }
    }

    // File not found, return original path (will fail with clear error)
    console.warn(`[PipelineRunner] PRD file not found in any location: ${prdPath}`);
    console.warn(`[PipelineRunner] Searched paths:`, searchPaths);
    return prdPath;
  }

  /**
   * Check if a pipeline is running for a given run ID
   */
  isRunning(runId: string): boolean {
    return this.runningPipelines.has(runId);
  }

  /**
   * Get count of running pipelines
   */
  getRunningCount(): number {
    return this.runningPipelines.size;
  }
}

// Singleton instance
let pipelineRunner: PipelineRunner | null = null;

/**
 * Get or create the pipeline runner instance
 */
export function getPipelineRunner(config?: PipelineRunnerConfig): PipelineRunner {
  if (!pipelineRunner) {
    if (!config) {
      config = {
        workspaceRoot: process.env.WORKSPACE_DIR || '.ai-test-workspace',
        promptsDir: process.env.PROMPTS_DIR || 'prompts',
      };
    }
    pipelineRunner = new PipelineRunner(config);
  }
  return pipelineRunner;
}

export default PipelineRunner;

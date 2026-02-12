/**
 * Pipeline Runner Service
 * Connects test run creation with TestPipeline execution
 * Runs pipeline in background and emits WebSocket events for progress updates
 * 
 * @see Requirements 13.1, 13.2, 13.3, 14.1
 */

import { Server as SocketIOServer } from 'socket.io';
import { 
  TestPipeline, 
  type PipelineConfig, 
  type PipelineResult,
  PrerequisiteValidator,
  type ResumableStep,
  CliAdapter,
} from '@smart-test-agent/core';
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

/**
 * 恢复执行时的步骤到状态映射
 * @see Requirements 6.1, 6.4
 */
const RESUME_STEP_TO_STATE: Record<ResumableStep, TestRunState> = {
  prd_parsing: 'parsing',
  test_execution: 'executing',
  codex_review: 'codex_reviewing',
  cross_validation: 'codex_reviewing',
  report_generation: 'report_ready',
  quality_gate: 'report_ready',
};

/**
 * 不允许恢复执行的状态
 * @see Requirements 1.5
 */
const NON_RESUMABLE_STATES: TestRunState[] = ['executing', 'codex_reviewing'];

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
      existingRunId: runId, // Use the existing run ID from database
      skipStateTransitions: true, // State is managed by PipelineRunner
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

      // Forward CLI log events to WebSocket
      if (event.type === 'cli_log') {
        if (this.io) {
          this.io.to(`run:${runId}`).emit('cli_log', {
            runId,
            source: event.data.source,
            type: event.data.type,
            message: event.data.message,
            timestamp: new Date().toISOString(),
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
      console.log(`[PipelineRunner] ========== 开始执行 Pipeline ==========`);
      console.log(`[PipelineRunner] Run ID: ${runId}`);
      console.log(`[PipelineRunner] startFromStep: ${config.startFromStep}`);
      console.log(`[PipelineRunner] isResume: ${config.isResume}`);
      
      const result = await pipeline.execute(config);

      console.log(`[PipelineRunner] ========== Pipeline 执行完成 ==========`);
      console.log(`[PipelineRunner] 状态: ${result.status}`);
      console.log(`[PipelineRunner] 步骤数: ${result.steps?.length || 0}`);

      // Update final state
      if (result.status === 'completed') {
        console.log(`[PipelineRunner] 更新状态为 report_ready`);
        await this.updateRunState(runId, 'report_ready', null, undefined, {
          reportPath: result.reportPath,
          qualityMetrics: result.qualityMetrics,
        });
      } else if (result.status === 'failed') {
        console.log(`[PipelineRunner] 更新状态为 failed, 错误: ${result.error}`);
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
      console.error(`[PipelineRunner] ========== Pipeline 执行异常 ==========`);
      console.error(`[PipelineRunner] Run ID: ${runId}`);
      console.error(`[PipelineRunner] 错误: ${errorMsg}`);
      console.error(`[PipelineRunner] Stack:`, error instanceof Error ? error.stack : '');
      
      await this.updateRunState(runId, 'failed', 'internal_error', errorMsg);

      if (this.io) {
        this.io.to(`run:${runId}`).emit('pipeline:error', {
          runId,
          error: errorMsg,
        });
      }
    } finally {
      console.log(`[PipelineRunner] 清理 runningPipelines: ${runId}`);
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

  /**
   * 恢复执行 Pipeline
   * @param runId 运行 ID
   * @param fromStep 从哪个步骤开始恢复
   * @throws Error 如果验证失败
   * @see Requirements 1.1, 1.2, 1.3, 1.5, 6.1, 6.2, 6.3, 6.5
   */
  async resumePipeline(runId: string, fromStep: ResumableStep): Promise<void> {
    console.log(`[PipelineRunner] Resuming pipeline for run: ${runId} from step: ${fromStep}`);

    // 1. 验证 TestRun 存在
    const testRun = await prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!testRun) {
      throw new Error(`TestRun not found: ${runId}`);
    }

    // 2. 验证 TestRun 状态允许恢复（非 executing/codex_reviewing）
    if (NON_RESUMABLE_STATES.includes(testRun.state as TestRunState)) {
      throw new Error(`TestRun is already running (state: ${testRun.state})`);
    }

    // 3. 验证前置文件存在
    const validator = new PrerequisiteValidator(this.config.workspaceRoot);
    const validation = await validator.validateStep(runId, fromStep);
    
    if (!validation.valid) {
      throw new Error(`Missing prerequisite files: ${validation.missingFiles.join(', ')}`);
    }

    // 4. 获取 target profile
    const targetProfile = await prisma.targetProfile.findUnique({
      where: { projectId: testRun.projectId },
    });

    if (!targetProfile) {
      throw new Error(`Target profile not found for project: ${testRun.projectId}`);
    }

    // 5. 获取项目信息
    const project = await prisma.project.findUnique({
      where: { id: testRun.projectId },
    });

    if (!project) {
      throw new Error(`Project not found: ${testRun.projectId}`);
    }

    // 6. 转换 target profile
    const profileConfig = this.convertTargetProfile(targetProfile);

    // 7. 解析 PRD 路径
    const prdPath = await this.resolvePrdPath(testRun.prdPath, testRun.projectId);

    // 8. 创建 Pipeline 配置，设置 startFromStep 和 isResume
    const pipelineConfig: PipelineConfig = {
      projectId: testRun.projectId,
      prdPath,
      routes: fromJsonString<string[]>(testRun.testedRoutes),
      targetProfile: profileConfig,
      workspaceRoot: this.config.workspaceRoot,
      promptsDir: this.config.promptsDir,
      existingRunId: runId,
      skipStateTransitions: true,
      startFromStep: fromStep,
      isResume: true,
    };

    // 9. 更新 TestRun 状态为恢复步骤对应的状态
    const newState = RESUME_STEP_TO_STATE[fromStep];
    await this.updateRunState(runId, newState, null, undefined);

    // 10. 创建并配置 Pipeline
    const pipeline = new TestPipeline();
    this.runningPipelines.set(runId, pipeline);

    // 11. 设置事件处理器
    pipeline.onEvent(async (event) => {
      console.log(`[PipelineRunner] Resume Event: ${event.type} for run ${event.runId}`, event.data);

      // Emit to WebSocket
      if (this.io) {
        this.io.to(`run:${runId}`).emit('pipeline:event', event);
      }

      // 处理 pipeline_resumed 事件
      if (event.type === 'pipeline_resumed') {
        if (this.io) {
          this.io.to(`run:${runId}`).emit('pipeline:resumed', {
            runId,
            fromStep: event.data.fromStep,
            timestamp: event.data.timestamp,
          });
        }
      }

      // 处理 step_skipped 事件
      if (event.type === 'step_skipped') {
        if (this.io) {
          this.io.to(`run:${runId}`).emit('step:skipped', {
            runId,
            step: event.data.step,
            timestamp: event.data.timestamp,
          });
        }
      }

      // Update database state based on step
      if (event.type === 'step_started') {
        const step = event.data.step as string;
        const stepState = STEP_TO_STATE[step];
        if (stepState) {
          await this.updateRunState(runId, stepState);
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

      // Forward CLI log events to WebSocket
      if (event.type === 'cli_log') {
        if (this.io) {
          this.io.to(`run:${runId}`).emit('cli_log', {
            runId,
            source: event.data.source,
            type: event.data.type,
            message: event.data.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // 12. 在后台执行 Pipeline
    this.executePipelineAsync(runId, pipeline, pipelineConfig);
  }

  /**
   * 获取可恢复的步骤列表
   * @param runId 运行 ID
   * @returns 可恢复步骤列表
   * @see Requirements 3.1
   */
  async getResumableSteps(runId: string) {
    const validator = new PrerequisiteValidator(this.config.workspaceRoot);
    return validator.getResumableSteps(runId);
  }

  /**
   * 审批通过后继续执行 Pipeline
   * @param runId 运行 ID
   * @throws Error 如果验证失败
   */
  async continueAfterApproval(runId: string): Promise<void> {
    console.log(`[PipelineRunner] ========== 审批通过，开始继续执行 ==========`);
    console.log(`[PipelineRunner] Run ID: ${runId}`);

    // 1. 验证 TestRun 存在
    console.log(`[PipelineRunner] Step 1: 验证 TestRun 存在...`);
    const testRun = await prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!testRun) {
      console.error(`[PipelineRunner] TestRun not found: ${runId}`);
      throw new Error(`TestRun not found: ${runId}`);
    }
    console.log(`[PipelineRunner] TestRun 状态: ${testRun.state}`);

    // 2. 验证 TestRun 状态为 awaiting_approval 或 executing（可能是之前执行中断）
    console.log(`[PipelineRunner] Step 2: 验证状态...`);
    if (testRun.state !== 'awaiting_approval' && testRun.state !== 'executing') {
      console.error(`[PipelineRunner] 状态不正确: ${testRun.state}`);
      throw new Error(`TestRun is not in a resumable state (state: ${testRun.state})`);
    }
    
    // 如果状态是 executing，检查是否真的在运行
    if (testRun.state === 'executing') {
      if (this.runningPipelines.has(runId)) {
        console.error(`[PipelineRunner] Pipeline 已在运行中`);
        throw new Error(`Pipeline is already running for run: ${runId}`);
      }
      console.log(`[PipelineRunner] 状态为 executing 但 Pipeline 未运行，允许恢复执行`);
    }

    // 3. 获取 target profile
    console.log(`[PipelineRunner] Step 3: 获取 target profile...`);
    const targetProfile = await prisma.targetProfile.findUnique({
      where: { projectId: testRun.projectId },
    });

    if (!targetProfile) {
      console.error(`[PipelineRunner] Target profile not found`);
      throw new Error(`Target profile not found for project: ${testRun.projectId}`);
    }
    console.log(`[PipelineRunner] Target profile 获取成功, baseUrl: ${targetProfile.baseUrl}`);

    // 4. 获取项目信息
    console.log(`[PipelineRunner] Step 4: 获取项目信息...`);
    const project = await prisma.project.findUnique({
      where: { id: testRun.projectId },
    });

    if (!project) {
      console.error(`[PipelineRunner] Project not found`);
      throw new Error(`Project not found: ${testRun.projectId}`);
    }
    console.log(`[PipelineRunner] 项目: ${project.name}`);

    // 5. 转换 target profile
    console.log(`[PipelineRunner] Step 5: 转换 target profile...`);
    const profileConfig = this.convertTargetProfile(targetProfile);

    // 6. 解析 PRD 路径
    console.log(`[PipelineRunner] Step 6: 解析 PRD 路径...`);
    const prdPath = await this.resolvePrdPath(testRun.prdPath, testRun.projectId);
    console.log(`[PipelineRunner] PRD 路径: ${prdPath}`);

    // 7. 创建 Pipeline 配置，从 test_execution 步骤开始
    console.log(`[PipelineRunner] Step 7: 创建 Pipeline 配置...`);
    const pipelineConfig: PipelineConfig = {
      projectId: testRun.projectId,
      prdPath,
      routes: fromJsonString<string[]>(testRun.testedRoutes),
      targetProfile: profileConfig,
      workspaceRoot: this.config.workspaceRoot,
      promptsDir: this.config.promptsDir,
      existingRunId: runId,
      skipStateTransitions: true,
      startFromStep: 'test_execution',
      isResume: true,
      skipApprovalWait: true,
    };
    console.log(`[PipelineRunner] Pipeline 配置: startFromStep=${pipelineConfig.startFromStep}, isResume=${pipelineConfig.isResume}`);

    // 8. 更新 TestRun 状态为 executing
    console.log(`[PipelineRunner] Step 8: 更新状态为 executing...`);
    await this.updateRunState(runId, 'executing', null, undefined);

    // 9. 创建并配置 Pipeline
    console.log(`[PipelineRunner] Step 9: 创建 Pipeline 实例...`);
    const pipeline = new TestPipeline();
    this.runningPipelines.set(runId, pipeline);

    // 10. 设置事件处理器
    console.log(`[PipelineRunner] Step 10: 设置事件处理器...`);
    pipeline.onEvent(async (event) => {
      console.log(`[PipelineRunner] Continue Event: ${event.type} for run ${event.runId}`, event.data);

      // Emit to WebSocket
      if (this.io) {
        this.io.to(`run:${runId}`).emit('pipeline:event', event);
      }

      // Update database state based on step
      if (event.type === 'step_started') {
        const step = event.data.step as string;
        console.log(`[PipelineRunner] 步骤开始: ${step}`);
        const stepState = STEP_TO_STATE[step];
        if (stepState) {
          await this.updateRunState(runId, stepState);
        }
      }

      if (event.type === 'step_completed') {
        console.log(`[PipelineRunner] 步骤完成: ${event.data.step}, 状态: ${event.data.status}`);
      }

      if (event.type === 'step_failed') {
        const errorMsg = event.data.error as string;
        console.error(`[PipelineRunner] 步骤失败: ${event.data.step}`, errorMsg);
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

      // Forward CLI log events to WebSocket
      if (event.type === 'cli_log') {
        const msg = String(event.data.message || '').substring(0, 100);
        console.log(`[PipelineRunner] CLI 日志: [${event.data.source}] ${msg}`);
        if (this.io) {
          this.io.to(`run:${runId}`).emit('cli_log', {
            runId,
            source: event.data.source,
            type: event.data.type,
            message: event.data.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // 11. 在后台执行 Pipeline
    console.log(`[PipelineRunner] Step 11: 启动后台 Pipeline 执行...`);
    this.executePipelineAsync(runId, pipeline, pipelineConfig);
    console.log(`[PipelineRunner] ========== Pipeline 已在后台启动 ==========`);
  }

  /**
   * 基于反馈重新生成测试用例
   * @param runId 运行 ID
   * @param feedback 用户反馈信息
   * @throws Error 如果验证失败
   * @see Requirements 5.1, 5.2, 5.3
   */
  async regenerateTestCases(
    runId: string,
    feedback: { feedbackType: string; feedbackDetail: string }
  ): Promise<void> {
    console.log(`[PipelineRunner] Regenerating test cases for run: ${runId}`);

    // 1. 验证 TestRun 存在
    const testRun = await prisma.testRun.findUnique({
      where: { id: runId },
    });

    if (!testRun) {
      throw new Error(`TestRun not found: ${runId}`);
    }

    // 2. 获取 target profile
    const targetProfile = await prisma.targetProfile.findUnique({
      where: { projectId: testRun.projectId },
    });

    if (!targetProfile) {
      throw new Error(`Target profile not found for project: ${testRun.projectId}`);
    }

    // 3. 获取项目信息
    const project = await prisma.project.findUnique({
      where: { id: testRun.projectId },
    });

    if (!project) {
      throw new Error(`Project not found: ${testRun.projectId}`);
    }

    // 4. 读取原始 PRD
    const prdPath = await this.resolvePrdPath(testRun.prdPath, testRun.projectId);
    let prdContent = '';
    try {
      prdContent = await fs.readFile(prdPath, 'utf-8');
    } catch {
      console.warn(`[PipelineRunner] Failed to read PRD file: ${prdPath}`);
    }

    // 5. 读取已生成的测试用例
    const workspaceRoot = this.config.workspaceRoot;
    const outputsDir = path.join(workspaceRoot, runId, 'outputs');
    const testCasesDir = path.join(outputsDir, 'test-cases');
    const requirementsPath = path.join(outputsDir, 'requirements.json');

    let existingTestCases: unknown[] = [];
    let requirements: unknown[] = [];

    // 读取需求
    try {
      const reqContent = await fs.readFile(requirementsPath, 'utf-8');
      const parsed = JSON.parse(reqContent);
      requirements = parsed.requirements || (Array.isArray(parsed) ? parsed : []);
    } catch {
      console.warn(`[PipelineRunner] Failed to read requirements: ${requirementsPath}`);
    }

    // 读取测试用例
    try {
      const files = await fs.readdir(testCasesDir);
      const reqFiles = files.filter((f: string) => f.startsWith('REQ-') && f.endsWith('.json'));
      
      for (const reqFile of reqFiles) {
        try {
          const filePath = path.join(testCasesDir, reqFile);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(content);
          
          if (Array.isArray(parsed)) {
            existingTestCases.push(...parsed);
          } else if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
            existingTestCases.push(...parsed.test_cases);
          } else if (parsed.testCases && Array.isArray(parsed.testCases)) {
            existingTestCases.push(...parsed.testCases);
          }
        } catch (e) {
          console.warn(`[PipelineRunner] Failed to parse test case file ${reqFile}:`, e);
        }
      }
    } catch {
      // 尝试读取单文件格式
      try {
        const testCasesPath = path.join(outputsDir, 'test-cases.json');
        const content = await fs.readFile(testCasesPath, 'utf-8');
        const parsed = JSON.parse(content);
        existingTestCases = Array.isArray(parsed) ? parsed : (parsed.test_cases || parsed.testCases || []);
      } catch (e) {
        console.warn(`[PipelineRunner] Failed to read test cases:`, e);
      }
    }

    // 6. 构建包含反馈的 prompt
    const feedbackTypeLabels: Record<string, string> = {
      coverage_incomplete: '测试用例覆盖不全',
      steps_incorrect: '测试步骤不正确',
      assertions_inaccurate: '断言不准确',
      other: '其他问题',
    };

    const feedbackTypeLabel = feedbackTypeLabels[feedback.feedbackType] || feedback.feedbackType;
    const testRoutes = fromJsonString<string[]>(testRun.testedRoutes);

    const regeneratePrompt = `# 测试用例重新生成任务

## 背景

用户对之前生成的测试用例提出了反馈，需要根据反馈重新生成更准确的测试用例。

## 用户反馈

**反馈类型**: ${feedbackTypeLabel}

**详细反馈**: ${feedback.feedbackDetail}

## 原始 PRD 文档

${prdContent || '（PRD 文档不可用，请参考已有的需求和测试用例）'}

## 已生成的需求列表

\`\`\`json
${JSON.stringify(requirements, null, 2)}
\`\`\`

## 已生成的测试用例（需要改进）

\`\`\`json
${JSON.stringify(existingTestCases, null, 2)}
\`\`\`

## 测试路由配置

**本次测试的目标路由：**

${testRoutes.map(r => `- \`${r}\``).join('\n')}

## 任务要求

1. 仔细阅读用户反馈，理解需要改进的地方
2. 根据反馈类型进行针对性改进：
   - **覆盖不全**: 增加缺失的测试场景，确保覆盖所有需求点
   - **步骤不正确**: 修正测试步骤，确保操作顺序和目标元素正确
   - **断言不准确**: 修正断言条件，确保验证点准确
   - **其他问题**: 根据具体反馈进行修改
3. 保持已有测试用例中正确的部分
4. 确保所有测试用例的 \`route\` 字段使用指定的测试路由

## 输出要求

**1. 需求文件**：\`./outputs/requirements.json\`
（如果需求没有变化，可以保持原样）

**2. 测试用例文件**：按需求分文件存储

首先清理旧的测试用例文件：
\`\`\`bash
rm -rf ./outputs/test-cases/*
\`\`\`

然后为每个需求创建单独的测试用例文件：
- \`./outputs/test-cases/REQ-001.json\` - REQ-001 的测试用例
- \`./outputs/test-cases/REQ-002.json\` - REQ-002 的测试用例
- ...

每个文件格式：
\`\`\`json
{
  "requirement_id": "REQ-001",
  "test_cases": [
    {"case_id": "TC-001", ...},
    {"case_id": "TC-002", ...}
  ]
}
\`\`\`

写入完成后，输出确认信息：
\`\`\`json
{"status": "completed", "requirements_count": X, "test_cases_count": Y}
\`\`\`
`;

    // 7. 调用 Claude Code 重新生成
    const cliAdapter = new CliAdapter();
    const workspacePath = path.join(workspaceRoot, runId);

    const onLog = (type: 'stdout' | 'stderr' | 'info', message: string) => {
      if (this.io) {
        this.io.to(`run:${runId}`).emit('cli_log', {
          runId,
          source: 'claude',
          type,
          message,
          timestamp: new Date().toISOString(),
        });
      }
    };

    try {
      const result = await cliAdapter.invokeClaudeCode({
        prompt: regeneratePrompt,
        workingDir: workspacePath,
        outputFormat: 'stream-json',
        onLog,
      });

      // 保存日志
      const logsDir = path.join(workspacePath, 'logs');
      try {
        await fs.mkdir(logsDir, { recursive: true });
      } catch { /* ignore */ }
      await fs.writeFile(
        path.join(logsDir, 'regenerate.log'),
        result.rawOutput || result.output || ''
      );

      if (!result.success) {
        throw new Error(`Claude Code 调用失败: ${result.error || '未知错误'}`);
      }

      // 8. 更新状态为 awaiting_approval
      await this.updateRunState(runId, 'awaiting_approval');

      // 9. 发送 WebSocket 事件
      if (this.io) {
        this.io.to(`run:${runId}`).emit('regeneration:completed', {
          runId,
          timestamp: new Date().toISOString(),
        });

        this.io.to(`run:${runId}`).emit('approval:required', {
          runId,
          testCasesPath: path.join(outputsDir, 'test-cases'),
        });
      }

      console.log(`[PipelineRunner] Test cases regenerated for run: ${runId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[PipelineRunner] Regeneration failed for run ${runId}:`, errorMsg);
      
      // 更新状态为失败
      await this.updateRunState(runId, 'failed', 'internal_error', errorMsg);

      if (this.io) {
        this.io.to(`run:${runId}`).emit('regeneration:failed', {
          runId,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }

      throw error;
    }
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
      // Server runs from apps/server, so we need to go up to monorepo root for prompts
      const serverRoot = process.cwd();
      const monorepoRoot = path.resolve(serverRoot, '..', '..'); // smart-test-agent
      
      config = {
        workspaceRoot: process.env.WORKSPACE_DIR || '.ai-test-workspace',
        promptsDir: process.env.PROMPTS_DIR || path.join(monorepoRoot, 'prompts'),
      };
    }
    pipelineRunner = new PipelineRunner(config);
  }
  return pipelineRunner;
}

export default PipelineRunner;

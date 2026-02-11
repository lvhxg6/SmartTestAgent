/**
 * End-to-End Test Pipeline
 * Orchestrates the complete test flow from PRD to report
 * 
 * 工作目录结构:
 * .ai-test-workspace/{runId}/
 * ├── inputs/                    # 输入文件（只读）
 * │   ├── prd.md                 # PRD 文档
 * │   ├── routes/                # 路由配置文件
 * │   └── pages/                 # 页面源码文件
 * ├── outputs/                   # 输出文件
 * │   ├── requirements.json      # 解析出的需求
 * │   ├── test-cases.json        # 生成的测试用例
 * │   ├── execution-results.json # 执行结果
 * │   └── report.html            # 测试报告
 * ├── evidence/                  # 证据文件
 * │   ├── screenshots/           # 截图
 * │   └── traces/                # Playwright traces
 * └── logs/                      # 日志文件
 *     ├── prd-parse.log          # PRD 解析日志
 *     ├── test-execute.log       # 测试执行日志
 *     └── codex-review.log       # Codex 审核日志
 * 
 * @see Requirements: All
 */

import { Orchestrator, type TransitionOptions } from '../orchestrator/index.js';
import { SourceIndexer } from '../source-indexer/index.js';
import { CliAdapter } from '../cli-adapter/index.js';
import { CrossValidator } from '../cross-validator/index.js';
import { ReportGenerator } from '../report-generator/index.js';
import { calculateRC, calculateAPR, evaluateGate } from '../quality-gate/index.js';
import { createWorkspace, type WorkspaceStructure } from '../workspace/workspace-manager.js';
import { createManifest, saveManifest } from '../workspace/manifest-manager.js';
import type {
  TargetProfile,
  StateEvent,
  Requirement,
  TestCase,
  Assertion,
} from '@smart-test-agent/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PipelineConfig {
  projectId: string;
  prdPath: string;
  routes: string[];
  targetProfile: TargetProfile;
  workspaceRoot: string;
  promptsDir: string;
  existingRunId?: string;
  skipStateTransitions?: boolean;
}

export interface StepResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  artifacts?: Record<string, string | number | boolean>;
}

export interface PipelineResult {
  runId: string;
  status: 'completed' | 'failed' | 'cancelled';
  steps: StepResult[];
  reportPath?: string;
  qualityMetrics?: { rc: number; apr: number; fr?: number };
  error?: string;
}

export type PipelineEventType =
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'state_changed'
  | 'screenshot_captured'
  | 'approval_required'
  | 'confirmation_required'
  | 'cli_log';

export type PipelineEventHandler = (event: {
  type: PipelineEventType;
  runId: string;
  data: Record<string, unknown>;
}) => void;

export class TestPipeline {
  private orchestrator: Orchestrator;
  private sourceIndexer: SourceIndexer;
  private cliAdapter: CliAdapter;
  private crossValidator: CrossValidator;
  private reportGenerator: ReportGenerator;
  private eventHandlers: PipelineEventHandler[] = [];
  private skipStateTransitions: boolean = false;

  constructor() {
    this.orchestrator = new Orchestrator();
    this.sourceIndexer = new SourceIndexer();
    this.cliAdapter = new CliAdapter();
    this.crossValidator = new CrossValidator();
    this.reportGenerator = new ReportGenerator();
  }

  onEvent(handler: PipelineEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(type: PipelineEventType, runId: string, data: Record<string, unknown>): void {
    for (const handler of this.eventHandlers) {
      try {
        handler({ type, runId, data });
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  async execute(config: PipelineConfig): Promise<PipelineResult> {
    const steps: StepResult[] = [];
    let runId = config.existingRunId || '';
    let workspace: WorkspaceStructure | null = null;
    
    this.skipStateTransitions = config.skipStateTransitions ?? false;

    try {
      // Step 0: Initialize workspace and copy input files
      const initResult = await this.executeStep('initialize', async () => {
        if (!runId) {
          const testRun = await this.orchestrator.createRun({
            projectId: config.projectId,
            prdPath: config.prdPath,
            routes: config.routes,
          });
          runId = testRun.id;
        }
        workspace = await createWorkspace(config.workspaceRoot, runId);
        
        // Create directory structure
        const inputsDir = path.join(workspace.root, 'inputs');
        const outputsDir = path.join(workspace.root, 'outputs');
        const logsDir = path.join(workspace.root, 'logs');
        await fs.mkdir(path.join(inputsDir, 'routes'), { recursive: true });
        await fs.mkdir(path.join(inputsDir, 'pages'), { recursive: true });
        await fs.mkdir(outputsDir, { recursive: true });
        await fs.mkdir(logsDir, { recursive: true });
        
        // Copy PRD file
        const prdContent = await fs.readFile(config.prdPath, 'utf-8');
        await fs.writeFile(path.join(inputsDir, 'prd.md'), prdContent);
        
        // Copy route files
        const sourceCode = config.targetProfile.sourceCode as { routeFiles?: string[]; pageFiles?: string[] };
        if (sourceCode?.routeFiles) {
          for (const routeFile of sourceCode.routeFiles) {
            try {
              const fileName = path.basename(routeFile);
              await fs.copyFile(routeFile, path.join(inputsDir, 'routes', fileName));
            } catch (err) {
              console.warn(`Could not copy route file: ${routeFile}`, err);
            }
          }
        }
        
        // Copy page files
        if (sourceCode?.pageFiles) {
          for (const pageFile of sourceCode.pageFiles) {
            try {
              const fileName = path.basename(pageFile);
              await fs.copyFile(pageFile, path.join(inputsDir, 'pages', fileName));
            } catch (err) {
              console.warn(`Could not copy page file: ${pageFile}`, err);
            }
          }
        }
        
        // Create manifest
        const manifest = createManifest(
          runId,
          config.projectId,
          { claudeCode: 'unknown', codex: 'unknown' },
          { prdParse: 'v1', uiTestExecute: 'v1', reviewResults: 'v1' }
        );
        await saveManifest(workspace.manifest, manifest);
        
        // Create README for the workspace
        const readme = `# 测试运行工作目录

运行 ID: ${runId}
项目 ID: ${config.projectId}
创建时间: ${new Date().toISOString()}

## 目录结构

- \`inputs/\` - 输入文件（PRD、路由配置、页面源码）
- \`outputs/\` - 输出文件（需求、测试用例、执行结果、报告）
- \`evidence/\` - 证据文件（截图、traces）
- \`logs/\` - 日志文件

## 输入文件

- PRD 文档: \`inputs/prd.md\`
- 路由配置: \`inputs/routes/\`
- 页面源码: \`inputs/pages/\`

## 测试路由

${config.routes.map(r => `- ${r}`).join('\n')}
`;
        await fs.writeFile(path.join(workspace.root, 'README.md'), readme);
        
        return { workspacePath: workspace.root, runId };
      }, runId);
      steps.push(initResult);
      if (initResult.status === 'failed' || !workspace) {
        return this.createFailedResult(runId, steps, initResult.error);
      }

      await this.transitionState(runId, 'START_PARSING');

      // Step 1: PRD parsing - run Claude Code in workspace directory
      const parseResult = await this.executeStep('prd_parsing', async () => {
        const promptPath = path.join(config.promptsDir, 'prd-parse.md');
        const promptTemplate = await fs.readFile(promptPath, 'utf-8');
        
        // Build prompt that tells Claude to read files from the workspace
        const prompt = `${promptTemplate}

---

## 工作目录说明

当前工作目录包含所有需要的输入文件：

- \`inputs/prd.md\` - PRD 文档
- \`inputs/routes/\` - 路由配置文件（可能是 .js, .ts, .vue 或 .zip 文件）
- \`inputs/pages/\` - 页面源码文件（可能是 .js, .ts, .vue, .tsx 或 .zip 文件）

## 任务

1. 首先读取 \`inputs/prd.md\` 了解需求
2. 读取 \`inputs/routes/\` 下的路由配置文件（如果是 .zip 文件，请先解压）
3. 读取 \`inputs/pages/\` 下的页面源码文件（如果是 .zip 文件，请先解压）
4. 根据 PRD 和源码分析，生成 requirements.json 和 test-cases.json
5. 将结果保存到 \`outputs/requirements.json\` 和 \`outputs/test-cases.json\`

## 输出要求

完成后，请输出一个 JSON 对象，包含：
\`\`\`json
{
  "requirements": [...],  // 需求列表
  "testCases": [...]      // 测试用例列表
}
\`\`\`
`;
        
        const onLog = (type: 'stdout' | 'stderr' | 'info', message: string) => {
          this.emit('cli_log', runId, { source: 'claude', type, message });
        };
        
        // Run Claude Code in the workspace directory
        const result = await this.cliAdapter.invokeClaudeCode({
          prompt,
          workingDir: workspace!.root,  // Key change: run in workspace directory
          outputFormat: 'stream-json',
          onLog,
        });
        
        // Save raw output for debugging
        await fs.writeFile(
          path.join(workspace!.root, 'logs', 'prd-parse.log'),
          result.rawOutput || result.output || ''
        );
        
        if (!result.success) {
          throw new Error(`Claude Code 调用失败: ${result.error || '未知错误'}`);
        }
        
        if (!result.output || result.output.trim() === '') {
          throw new Error('Claude Code 返回空输出');
        }
        
        // Parse output
        let parsed: { requirements?: unknown[]; testCases?: unknown[] };
        try {
          parsed = JSON.parse(result.output);
        } catch {
          const jsonMatch = result.output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('无法解析 Claude Code 输出为 JSON');
          }
        }
        
        // Save to outputs directory
        const outputsDir = path.join(workspace!.root, 'outputs');
        await fs.writeFile(
          path.join(outputsDir, 'requirements.json'),
          JSON.stringify(parsed.requirements || [], null, 2)
        );
        await fs.writeFile(
          path.join(outputsDir, 'test-cases.json'),
          JSON.stringify(parsed.testCases || [], null, 2)
        );
        
        return {
          requirementsPath: path.join(outputsDir, 'requirements.json'),
          testCasesPath: path.join(outputsDir, 'test-cases.json'),
        };
      }, runId);
      steps.push(parseResult);
      if (parseResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, parseResult.error);
      }

      await this.transitionState(runId, 'GENERATION_COMPLETE');
      this.emit('approval_required', runId, { testCasesPath: parseResult.artifacts?.testCasesPath });

      // Step 2: Test execution
      const execResult = await this.executeStep('test_execution', async () => {
        const testCases = JSON.parse(
          await fs.readFile(parseResult.artifacts?.testCasesPath as string, 'utf-8')
        );
        const execPromptPath = path.join(config.promptsDir, 'ui-test-execute.md');
        const execPrompt = await fs.readFile(execPromptPath, 'utf-8');
        
        const prompt = `${execPrompt}

---

## 工作目录说明

当前工作目录结构：
- \`inputs/\` - 输入文件
- \`outputs/\` - 输出文件（包含 test-cases.json）
- \`evidence/screenshots/\` - 截图保存目录

## 测试用例

${JSON.stringify(testCases, null, 2)}

## 任务

1. 读取 \`outputs/test-cases.json\` 获取测试用例
2. 执行每个测试用例
3. 将截图保存到 \`evidence/screenshots/\` 目录
4. 将执行结果保存到 \`outputs/execution-results.json\`
`;
        
        const onLog = (type: 'stdout' | 'stderr' | 'info', message: string) => {
          this.emit('cli_log', runId, { source: 'claude', type, message });
        };
        
        const result = await this.cliAdapter.invokeClaudeCode({
          prompt,
          workingDir: workspace!.root,
          outputFormat: 'stream-json',
          allowedTools: ['Bash', 'Read', 'Write'],
          onLog,
        });
        
        await fs.writeFile(
          path.join(workspace!.root, 'logs', 'test-execute.log'),
          result.rawOutput || result.output || ''
        );
        
        if (!result.success) {
          throw new Error(`Claude Code 调用失败: ${result.error || '未知错误'}`);
        }
        
        // Parse execution results
        let executionResults: unknown;
        try {
          executionResults = JSON.parse(result.output);
        } catch {
          const jsonMatch = result.output.match(/\{[\s\S]*\}/) || result.output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            executionResults = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('无法解析执行结果为 JSON');
          }
        }
        
        const outputsDir = path.join(workspace!.root, 'outputs');
        await fs.writeFile(
          path.join(outputsDir, 'execution-results.json'),
          JSON.stringify(executionResults, null, 2)
        );
        
        return {
          executionResultsPath: path.join(outputsDir, 'execution-results.json'),
          screenshotsDir: path.join(workspace!.root, 'evidence', 'screenshots'),
        };
      }, runId);
      steps.push(execResult);
      if (execResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'playwright_error' });
        return this.createFailedResult(runId, steps, execResult.error);
      }

      await this.transitionState(runId, 'EXECUTION_COMPLETE');

      // Step 3: Codex review
      const reviewResult = await this.executeStep('codex_review', async () => {
        const executionResults = JSON.parse(
          await fs.readFile(execResult.artifacts?.executionResultsPath as string, 'utf-8')
        );
        const reviewPromptPath = path.join(config.promptsDir, 'review-results.md');
        const reviewPrompt = await fs.readFile(reviewPromptPath, 'utf-8');
        
        const prompt = `${reviewPrompt}

---

## 执行结果

${JSON.stringify(executionResults, null, 2)}
`;
        
        const onLog = (type: 'stdout' | 'stderr' | 'info', message: string) => {
          this.emit('cli_log', runId, { source: 'codex', type, message });
        };
        
        const result = await this.cliAdapter.invokeCodex({
          prompt,
          workingDir: workspace!.root,
          onLog,
        });
        
        await fs.writeFile(
          path.join(workspace!.root, 'logs', 'codex-review.log'),
          result.output || ''
        );
        
        if (!result.success) {
          throw new Error(`Codex 调用失败: ${result.error || '未知错误'}`);
        }
        
        let reviewResults: unknown;
        try {
          reviewResults = JSON.parse(result.output);
        } catch {
          const jsonMatch = result.output.match(/\{[\s\S]*\}/) || result.output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            reviewResults = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('无法解析 Codex 输出为 JSON');
          }
        }
        
        const outputsDir = path.join(workspace!.root, 'outputs');
        await fs.writeFile(
          path.join(outputsDir, 'codex-review-results.json'),
          JSON.stringify(reviewResults, null, 2)
        );
        
        return { reviewResultsPath: path.join(outputsDir, 'codex-review-results.json') };
      }, runId);
      steps.push(reviewResult);
      if (reviewResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, reviewResult.error);
      }

      // Step 4: Cross-validation
      const validationResult = await this.executeStep('cross_validation', async () => {
        const outputsDir = path.join(workspace!.root, 'outputs');
        const requirements: Requirement[] = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'requirements.json'), 'utf-8')
        );
        const testCases: TestCase[] = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'test-cases.json'), 'utf-8')
        );
        const reviewResults = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'codex-review-results.json'), 'utf-8')
        );
        const executionResults = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'execution-results.json'), 'utf-8')
        );
        
        const assertions: Assertion[] = executionResults.testCases?.flatMap(
          (tc: { assertions?: Assertion[] }) => tc.assertions || []
        ) || [];
        
        const crossValidationResult = this.crossValidator.crossValidate(
          assertions, reviewResults, requirements, testCases
        );
        
        await fs.writeFile(
          path.join(outputsDir, 'cross-validation-results.json'),
          JSON.stringify(crossValidationResult, null, 2)
        );
        
        return {
          crossValidationPath: path.join(outputsDir, 'cross-validation-results.json'),
          conflictCount: crossValidationResult.arbitrationSummary.conflicts,
        };
      }, runId);
      steps.push(validationResult);
      if (validationResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'verdict_conflict' });
        return this.createFailedResult(runId, steps, validationResult.error);
      }

      // Step 5: Generate report
      const reportResult = await this.executeStep('report_generation', async () => {
        const outputsDir = path.join(workspace!.root, 'outputs');
        const requirements: Requirement[] = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'requirements.json'), 'utf-8')
        );
        const testCases: TestCase[] = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'test-cases.json'), 'utf-8')
        );
        const crossValidationResults = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'cross-validation-results.json'), 'utf-8')
        );
        
        const { reportPath } = this.reportGenerator.generateReport(
          crossValidationResults.updatedAssertions || [],
          testCases,
          requirements,
          { runId, outputDir: outputsDir }
        );
        
        return { reportPath };
      }, runId);
      steps.push(reportResult);
      if (reportResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, reportResult.error);
      }

      // Step 6: Quality gate
      const gateResult = await this.executeStep('quality_gate', async () => {
        const outputsDir = path.join(workspace!.root, 'outputs');
        const requirements: Requirement[] = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'requirements.json'), 'utf-8')
        );
        const testCases: TestCase[] = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'test-cases.json'), 'utf-8')
        );
        const crossValidationResults = JSON.parse(
          await fs.readFile(path.join(outputsDir, 'cross-validation-results.json'), 'utf-8')
        );
        
        const rc = calculateRC(requirements, testCases);
        const apr = calculateAPR(crossValidationResults.updatedAssertions || []);
        const gateStatus = evaluateGate(
          requirements, testCases, crossValidationResults.updatedAssertions || []
        );
        
        return { rc: rc.value, apr: apr.value, passed: gateStatus.passed, blocked: gateStatus.blocked };
      }, runId);
      steps.push(gateResult);

      await this.transitionState(runId, 'REVIEW_COMPLETE');
      this.emit('confirmation_required', runId, { reportPath: reportResult.artifacts?.reportPath });

      return {
        runId,
        status: 'completed',
        steps,
        reportPath: reportResult.artifacts?.reportPath as string,
        qualityMetrics: {
          rc: gateResult.artifacts?.rc as number || 0,
          apr: gateResult.artifacts?.apr as number || 0,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createFailedResult(runId, steps, errorMessage);
    }
  }

  private async executeStep(
    stepName: string,
    fn: () => Promise<Record<string, string | number | boolean>>,
    runId: string
  ): Promise<StepResult> {
    const startTime = Date.now();
    this.emit('step_started', runId, { step: stepName });
    try {
      const artifacts = await fn();
      const duration = Date.now() - startTime;
      this.emit('step_completed', runId, { step: stepName, duration, artifacts });
      return { step: stepName, status: 'success', duration, artifacts };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('step_failed', runId, { step: stepName, duration, error: errorMessage });
      return { step: stepName, status: 'failed', duration, error: errorMessage };
    }
  }

  private async transitionState(runId: string, event: StateEvent, options?: TransitionOptions): Promise<void> {
    if (this.skipStateTransitions) {
      return;
    }
    await this.orchestrator.transition(runId, event, options);
    const state = await this.orchestrator.getState(runId);
    this.emit('state_changed', runId, { state });
  }

  private createFailedResult(runId: string, steps: StepResult[], error?: string): PipelineResult {
    return { runId, status: 'failed', steps, error };
  }

  async handleApproval(runId: string, approved: boolean): Promise<void> {
    const event: StateEvent = approved ? 'APPROVED' : 'REJECTED';
    await this.transitionState(runId, event);
  }

  async handleConfirmation(runId: string, confirmed: boolean, retest = false): Promise<void> {
    let event: StateEvent;
    if (confirmed) event = 'CONFIRMED';
    else if (retest) event = 'RETEST';
    else return;
    await this.transitionState(runId, event);
  }
}

export default TestPipeline;

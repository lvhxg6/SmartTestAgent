/**
 * End-to-End Test Pipeline
 * Orchestrates the complete test flow from PRD to report
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
  SourceContext,
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
  /** Optional existing run ID - if provided, skip creating a new run */
  existingRunId?: string;
  /** Skip internal state transitions (when managed externally) */
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
  | 'confirmation_required';

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
    
    // Set skip state transitions flag
    this.skipStateTransitions = config.skipStateTransitions ?? false;

    try {
      // Step 0: Initialize
      const initResult = await this.executeStep('initialize', async () => {
        // Use existing runId if provided, otherwise create new run
        if (!runId) {
          const testRun = await this.orchestrator.createRun({
            projectId: config.projectId,
            prdPath: config.prdPath,
            routes: config.routes,
          });
          runId = testRun.id;
        }
        workspace = await createWorkspace(config.workspaceRoot, runId);
        const manifest = createManifest(
          runId,
          config.projectId,
          { claudeCode: 'unknown', codex: 'unknown' },
          { prdParse: 'v1', uiTestExecute: 'v1', reviewResults: 'v1' }
        );
        await saveManifest(workspace.manifest, manifest);
        return { workspacePath: workspace.root, runId };
      }, runId);
      steps.push(initResult);
      if (initResult.status === 'failed' || !workspace) {
        return this.createFailedResult(runId, steps, initResult.error);
      }

      await this.transitionState(runId, 'START_PARSING');

      // Step 1: Source indexing
      // Adapted to work with uploaded route files instead of frontendRoot
      const indexResult = await this.executeStep('source_indexing', async () => {
        const contexts: SourceContext[] = [];
        const sourceCode = config.targetProfile.sourceCode as { routeFiles?: string[]; pageFiles?: string[] };
        
        // Read uploaded route files if available
        const routeFileContents: string[] = [];
        if (sourceCode?.routeFiles && sourceCode.routeFiles.length > 0) {
          for (const routeFile of sourceCode.routeFiles) {
            try {
              const content = await fs.readFile(routeFile, 'utf-8');
              routeFileContents.push(content);
            } catch (err) {
              console.warn(`Could not read route file: ${routeFile}`, err);
            }
          }
        }

        // Read uploaded page files if available
        const pageFileContents: string[] = [];
        if (sourceCode?.pageFiles && sourceCode.pageFiles.length > 0) {
          for (const pageFile of sourceCode.pageFiles) {
            try {
              const content = await fs.readFile(pageFile, 'utf-8');
              pageFileContents.push(content);
            } catch (err) {
              console.warn(`Could not read page file: ${pageFile}`, err);
            }
          }
        }

        // Create minimal source context for each route
        for (const route of config.routes) {
          const context: SourceContext = {
            route,
            component: {
              filePath: sourceCode?.pageFiles?.[0] || 'unknown',
              framework: config.targetProfile.uiFramework === 'antd' ? 'react' : 'vue',
              apiImports: [],
              truncated: false,
            },
            apis: [],
            framework: config.targetProfile.uiFramework === 'antd' ? 'react' : 'vue',
            // Include raw file contents for AI processing
            rawRouteFiles: routeFileContents,
            rawPageFiles: pageFileContents,
          };
          contexts.push(context);
        }

        const contextPath = path.join(workspace!.root, 'source-context');
        await fs.mkdir(contextPath, { recursive: true });
        await fs.writeFile(path.join(contextPath, 'contexts.json'), JSON.stringify(contexts, null, 2));
        
        // Also save raw files for reference
        if (routeFileContents.length > 0) {
          await fs.writeFile(path.join(contextPath, 'route-files.txt'), routeFileContents.join('\n\n---\n\n'));
        }
        if (pageFileContents.length > 0) {
          await fs.writeFile(path.join(contextPath, 'page-files.txt'), pageFileContents.join('\n\n---\n\n'));
        }

        return { sourceContextPath: path.join(contextPath, 'contexts.json') };
      }, runId);
      steps.push(indexResult);
      if (indexResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, indexResult.error);
      }

      await this.transitionState(runId, 'PARSING_COMPLETE');

      // Step 2: PRD parsing
      const parseResult = await this.executeStep('prd_parsing', async () => {
        const prdContent = await fs.readFile(config.prdPath, 'utf-8');
        const promptPath = path.join(config.promptsDir, 'prd-parse.md');
        const promptTemplate = await fs.readFile(promptPath, 'utf-8');
        const result = await this.cliAdapter.invokeClaudeCode({
          prompt: promptTemplate + '\n\n---\n\nPRD Content:\n' + prdContent,
          outputFormat: 'json',
        });
        
        // Check if Claude Code invocation was successful
        if (!result.success) {
          throw new Error(`Claude Code invocation failed: ${result.error || 'Unknown error'}`);
        }
        
        // Check if output is empty
        if (!result.output || result.output.trim() === '') {
          throw new Error('Claude Code returned empty output');
        }
        
        // Try to parse JSON output
        let parsed: { requirements?: unknown[]; testCases?: unknown[] };
        try {
          parsed = JSON.parse(result.output);
        } catch (parseError) {
          // Try to extract JSON from output
          const jsonMatch = result.output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(`Failed to parse Claude Code output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
          }
        }
        
        await fs.writeFile(path.join(workspace!.root, 'requirements.json'), JSON.stringify(parsed.requirements || [], null, 2));
        await fs.writeFile(path.join(workspace!.root, 'test-cases.json'), JSON.stringify(parsed.testCases || [], null, 2));
        return {
          requirementsPath: path.join(workspace!.root, 'requirements.json'),
          testCasesPath: path.join(workspace!.root, 'test-cases.json'),
        };
      }, runId);
      steps.push(parseResult);
      if (parseResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, parseResult.error);
      }

      await this.transitionState(runId, 'GENERATION_COMPLETE');
      this.emit('approval_required', runId, { testCasesPath: parseResult.artifacts?.testCasesPath });

      // Step 3: Test execution
      const execResult = await this.executeStep('test_execution', async () => {
        const testCases = JSON.parse(await fs.readFile(parseResult.artifacts?.testCasesPath as string, 'utf-8'));
        const execPromptPath = path.join(config.promptsDir, 'ui-test-execute.md');
        const execPrompt = await fs.readFile(execPromptPath, 'utf-8');
        const result = await this.cliAdapter.invokeClaudeCode({
          prompt: execPrompt + '\n\n---\n\nTest Cases:\n' + JSON.stringify(testCases, null, 2),
          outputFormat: 'json',
          allowedTools: ['Bash', 'Read', 'Write'],
        });
        
        // Check if Claude Code invocation was successful
        if (!result.success) {
          throw new Error(`Claude Code invocation failed: ${result.error || 'Unknown error'}`);
        }
        
        // Check if output is empty
        if (!result.output || result.output.trim() === '') {
          throw new Error('Claude Code returned empty output');
        }
        
        // Try to parse JSON output
        let executionResults: unknown;
        try {
          executionResults = JSON.parse(result.output);
        } catch (parseError) {
          // Try to extract JSON from output
          const jsonMatch = result.output.match(/\{[\s\S]*\}/) || result.output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            executionResults = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(`Failed to parse Claude Code output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
          }
        }
        
        await fs.writeFile(path.join(workspace!.root, 'execution-results.json'), JSON.stringify(executionResults, null, 2));
        return {
          executionResultsPath: path.join(workspace!.root, 'execution-results.json'),
          screenshotsDir: path.join(workspace!.root, 'evidence', 'screenshots'),
        };
      }, runId);
      steps.push(execResult);
      if (execResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'playwright_error' });
        return this.createFailedResult(runId, steps, execResult.error);
      }

      await this.transitionState(runId, 'EXECUTION_COMPLETE');

      // Step 4: Codex review
      const reviewResult = await this.executeStep('codex_review', async () => {
        const executionResults = JSON.parse(await fs.readFile(execResult.artifacts?.executionResultsPath as string, 'utf-8'));
        const reviewPromptPath = path.join(config.promptsDir, 'review-results.md');
        const reviewPrompt = await fs.readFile(reviewPromptPath, 'utf-8');
        const result = await this.cliAdapter.invokeCodex({
          prompt: reviewPrompt + '\n\n---\n\nExecution Results:\n' + JSON.stringify(executionResults, null, 2),
        });
        
        // Check if Codex invocation was successful
        if (!result.success) {
          throw new Error(`Codex invocation failed: ${result.error || 'Unknown error'}`);
        }
        
        // Check if output is empty
        if (!result.output || result.output.trim() === '') {
          throw new Error('Codex returned empty output');
        }
        
        // Try to parse JSON output
        let reviewResults: unknown;
        try {
          reviewResults = JSON.parse(result.output);
        } catch (parseError) {
          // Try to extract JSON from output (Codex may include extra text)
          const jsonMatch = result.output.match(/\{[\s\S]*\}/) || result.output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            reviewResults = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(`Failed to parse Codex output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
          }
        }
        
        await fs.writeFile(path.join(workspace!.root, 'codex-review-results.json'), JSON.stringify(reviewResults, null, 2));
        return { reviewResultsPath: path.join(workspace!.root, 'codex-review-results.json') };
      }, runId);
      steps.push(reviewResult);
      if (reviewResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, reviewResult.error);
      }

      // Step 5: Cross-validation
      const validationResult = await this.executeStep('cross_validation', async () => {
        const requirements: Requirement[] = JSON.parse(await fs.readFile(parseResult.artifacts?.requirementsPath as string, 'utf-8'));
        const testCases: TestCase[] = JSON.parse(await fs.readFile(parseResult.artifacts?.testCasesPath as string, 'utf-8'));
        const reviewResults = JSON.parse(await fs.readFile(reviewResult.artifacts?.reviewResultsPath as string, 'utf-8'));
        const executionResults = JSON.parse(await fs.readFile(execResult.artifacts?.executionResultsPath as string, 'utf-8'));
        const assertions: Assertion[] = executionResults.testCases?.flatMap((tc: { assertions?: Assertion[] }) => tc.assertions || []) || [];
        const crossValidationResult = this.crossValidator.crossValidate(assertions, reviewResults, requirements, testCases);
        await fs.writeFile(path.join(workspace!.root, 'cross-validation-results.json'), JSON.stringify(crossValidationResult, null, 2));
        return {
          crossValidationPath: path.join(workspace!.root, 'cross-validation-results.json'),
          conflictCount: crossValidationResult.arbitrationSummary.conflicts,
        };
      }, runId);
      steps.push(validationResult);
      if (validationResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'verdict_conflict' });
        return this.createFailedResult(runId, steps, validationResult.error);
      }

      // Step 6: Generate report
      const reportResult = await this.executeStep('report_generation', async () => {
        const requirements: Requirement[] = JSON.parse(await fs.readFile(parseResult.artifacts?.requirementsPath as string, 'utf-8'));
        const testCases: TestCase[] = JSON.parse(await fs.readFile(parseResult.artifacts?.testCasesPath as string, 'utf-8'));
        const crossValidationResults = JSON.parse(await fs.readFile(validationResult.artifacts?.crossValidationPath as string, 'utf-8'));
        const { reportPath } = this.reportGenerator.generateReport(
          crossValidationResults.updatedAssertions || [],
          testCases,
          requirements,
          { runId, outputDir: workspace!.root }
        );
        return { reportPath };
      }, runId);
      steps.push(reportResult);
      if (reportResult.status === 'failed') {
        await this.transitionState(runId, 'ERROR', { errorType: 'internal_error' });
        return this.createFailedResult(runId, steps, reportResult.error);
      }

      // Step 7: Quality gate
      const gateResult = await this.executeStep('quality_gate', async () => {
        const requirements: Requirement[] = JSON.parse(await fs.readFile(parseResult.artifacts?.requirementsPath as string, 'utf-8'));
        const testCases: TestCase[] = JSON.parse(await fs.readFile(parseResult.artifacts?.testCasesPath as string, 'utf-8'));
        const crossValidationResults = JSON.parse(await fs.readFile(validationResult.artifacts?.crossValidationPath as string, 'utf-8'));
        const rc = calculateRC(requirements, testCases);
        const apr = calculateAPR(crossValidationResults.updatedAssertions || []);
        const gateStatus = evaluateGate(requirements, testCases, crossValidationResults.updatedAssertions || []);
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
    // Skip if managed externally
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

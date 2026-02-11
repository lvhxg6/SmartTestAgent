/**
 * PrerequisiteValidator - 前置文件验证器
 * 负责验证恢复执行所需的前置文件是否存在
 * 
 * @see Requirements 2.1-2.7, 3.1-3.6
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Pipeline 步骤枚举
 */
export type PipelineStep =
  | 'initialize'
  | 'prd_parsing'
  | 'test_execution'
  | 'codex_review'
  | 'cross_validation'
  | 'report_generation'
  | 'quality_gate';

/**
 * 可恢复的步骤（排除 initialize，因为它是初始化步骤）
 */
export type ResumableStep = Exclude<PipelineStep, 'initialize'>;

/**
 * 步骤前置文件映射
 * @see Requirements 2.1-2.6
 */
export const STEP_PREREQUISITES: Record<ResumableStep, string[]> = {
  prd_parsing: ['inputs/prd.md', 'inputs/target-profile.json'],
  test_execution: ['outputs/requirements.json', 'outputs/test-cases.json', 'inputs/target-profile.json'],
  codex_review: ['outputs/execution-results.json'],
  cross_validation: ['outputs/codex-review-results.json', 'outputs/requirements.json', 'outputs/test-cases.json'],
  report_generation: ['outputs/cross-validation-results.json', 'outputs/requirements.json', 'outputs/test-cases.json'],
  quality_gate: ['outputs/cross-validation-results.json', 'outputs/requirements.json', 'outputs/test-cases.json'],
};

/**
 * 步骤执行顺序
 */
export const STEP_ORDER: PipelineStep[] = [
  'initialize',
  'prd_parsing',
  'test_execution',
  'codex_review',
  'cross_validation',
  'report_generation',
  'quality_gate',
];

/**
 * 可恢复步骤顺序（排除 initialize）
 */
export const RESUMABLE_STEP_ORDER: ResumableStep[] = [
  'prd_parsing',
  'test_execution',
  'codex_review',
  'cross_validation',
  'report_generation',
  'quality_gate',
];

/**
 * 步骤中文名称映射
 */
export const STEP_LABELS: Record<ResumableStep, string> = {
  prd_parsing: 'PRD 解析',
  test_execution: '测试执行',
  codex_review: 'Codex 审核',
  cross_validation: '交叉验证',
  report_generation: '报告生成',
  quality_gate: '质量门检查',
};


/**
 * 前置文件验证结果
 * @see Requirements 2.7
 */
export interface PrerequisiteValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 缺失的文件列表 */
  missingFiles: string[];
}

/**
 * 可恢复步骤信息
 * @see Requirements 3.1-3.6
 */
export interface ResumableStepInfo {
  /** 步骤名称 */
  step: ResumableStep;
  /** 步骤中文名称 */
  label: string;
  /** 是否可恢复 */
  available: boolean;
  /** 缺失的文件列表 */
  missingFiles: string[];
}

/**
 * 前置文件验证器
 * 负责验证恢复执行所需的前置文件是否存在
 */
export class PrerequisiteValidator {
  constructor(private workspaceRoot: string) {}

  /**
   * 验证指定步骤的前置文件是否存在
   * @param runId 运行 ID
   * @param step 要验证的步骤
   * @returns 验证结果
   * @see Requirements 2.1-2.6
   */
  async validateStep(runId: string, step: ResumableStep): Promise<PrerequisiteValidationResult> {
    const prerequisites = STEP_PREREQUISITES[step];
    const workspacePath = path.join(this.workspaceRoot, runId);
    const missingFiles: string[] = [];

    for (const prerequisite of prerequisites) {
      const filePath = path.join(workspacePath, prerequisite);
      const exists = await this.fileExists(filePath);
      
      // 特殊处理：test-cases.json 可以用 test-cases/ 目录替代
      if (!exists && prerequisite === 'outputs/test-cases.json') {
        const testCasesDir = path.join(workspacePath, 'outputs/test-cases');
        const dirExists = await this.directoryExists(testCasesDir);
        if (!dirExists) {
          missingFiles.push(prerequisite);
        }
      } else if (!exists) {
        missingFiles.push(prerequisite);
      }
    }

    return {
      valid: missingFiles.length === 0,
      missingFiles,
    };
  }

  /**
   * 获取所有可恢复的步骤
   * @param runId 运行 ID
   * @returns 可恢复步骤列表
   * @see Requirements 3.1-3.6
   */
  async getResumableSteps(runId: string): Promise<ResumableStepInfo[]> {
    const results: ResumableStepInfo[] = [];

    for (const step of RESUMABLE_STEP_ORDER) {
      const validation = await this.validateStep(runId, step);
      results.push({
        step,
        label: STEP_LABELS[step],
        available: validation.valid,
        missingFiles: validation.missingFiles,
      });
    }

    return results;
  }

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * 检查目录是否存在
   * @param dirPath 目录路径
   * @returns 是否存在
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

export default PrerequisiteValidator;

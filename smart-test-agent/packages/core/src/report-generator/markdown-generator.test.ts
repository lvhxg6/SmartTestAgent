/**
 * Unit tests for Markdown Generator
 * @see Requirements 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect } from 'vitest';
import { generateMarkdownReport, generateMinimalReport } from './markdown-generator.js';
import type { ReportData, DefectReport, TestCaseSummary, QualityMetric } from '@smart-test-agent/shared';

describe('Markdown Generator', () => {
  const createReportData = (overrides: Partial<ReportData> = {}): ReportData => ({
    runId: 'run-123',
    summary: {
      totalDefects: 2,
      severityDistribution: { critical: 1, major: 1, minor: 0, suggestion: 0 },
      affectedRoutes: ['/dashboard', '/users'],
      qualityMetrics: [
        { name: 'RC', value: 0.9, threshold: 0.85, passed: true },
        { name: 'APR', value: 0.95, threshold: 0.95, passed: true },
      ],
    },
    defects: [
      {
        id: 'DEF-A001',
        severity: 'critical',
        title: '[TC001] Element not visible',
        description: '**断言描述**: Element should be visible',
        screenshots: ['/screenshots/tc001-step1.png'],
        operationSteps: ['1. Navigate to dashboard', '2. Click button'],
        assertionId: 'A001',
        caseId: 'TC001',
        requirementId: 'REQ001',
        route: '/dashboard',
      },
      {
        id: 'DEF-A002',
        severity: 'major',
        title: '[TC002] Text mismatch',
        description: '**断言描述**: Text should match',
        screenshots: [],
        operationSteps: ['1. Navigate to users'],
        assertionId: 'A002',
        caseId: 'TC002',
        requirementId: 'REQ002',
        route: '/users',
      },
    ],
    testCases: [
      { caseId: 'TC001', title: 'Test Dashboard', status: 'failed', assertionCount: 2, passedCount: 1, failedCount: 1 },
      { caseId: 'TC002', title: 'Test Users', status: 'failed', assertionCount: 1, passedCount: 0, failedCount: 1 },
    ],
    generatedAt: '2024-01-15T10:30:00.000Z',
    ...overrides,
  });

  describe('generateMarkdownReport', () => {
    it('should generate report with header', () => {
      const data = createReportData();
      const report = generateMarkdownReport(data);

      expect(report).toContain('# 测试报告 - run-123');
      expect(report).toContain('**生成时间**:');
    });

    it('should include summary section', () => {
      const data = createReportData();
      const report = generateMarkdownReport(data);

      expect(report).toContain('## 摘要');
      expect(report).toContain('**总缺陷数**: 2');
      expect(report).toContain('严重: 1');
      expect(report).toContain('主要: 1');
      expect(report).toContain('`/dashboard`');
      expect(report).toContain('`/users`');
    });

    it('should include quality metrics table', () => {
      const data = createReportData();
      const report = generateMarkdownReport(data);

      expect(report).toContain('## 质量指标');
      expect(report).toContain('需求覆盖率 (RC)');
      expect(report).toContain('90.0%');
      expect(report).toContain('✅ 通过');
    });

    it('should include defect list', () => {
      const data = createReportData();
      const report = generateMarkdownReport(data);

      expect(report).toContain('## 缺陷列表');
      expect(report).toContain('### 缺陷 1:');
      expect(report).toContain('### 缺陷 2:');
      expect(report).toContain('🔴 严重 (Critical)');
      expect(report).toContain('🟠 主要 (Major)');
    });

    it('should include defect details', () => {
      const data = createReportData();
      const report = generateMarkdownReport(data);

      expect(report).toContain('**描述**:');
      expect(report).toContain('**操作步骤**:');
      expect(report).toContain('**截图**:');
      expect(report).toContain('![截图 1]');
      expect(report).toContain('**关联信息**:');
      expect(report).toContain('断言ID: `A001`');
    });

    it('should include test case summary table', () => {
      const data = createReportData();
      const report = generateMarkdownReport(data);

      expect(report).toContain('## 测试用例汇总');
      expect(report).toContain('| TC001 |');
      expect(report).toContain('| TC002 |');
      expect(report).toContain('❌ 失败');
      expect(report).toContain('1/2');
    });

    it('should handle empty defects', () => {
      const data = createReportData({
        defects: [],
        summary: {
          ...createReportData().summary,
          totalDefects: 0,
        },
      });
      const report = generateMarkdownReport(data);

      expect(report).toContain('无缺陷发现');
    });

    it('should handle empty quality metrics', () => {
      const data = createReportData({
        summary: {
          ...createReportData().summary,
          qualityMetrics: [],
        },
      });
      const report = generateMarkdownReport(data);

      expect(report).toContain('暂无质量指标数据');
    });

    it('should handle empty test cases', () => {
      const data = createReportData({ testCases: [] });
      const report = generateMarkdownReport(data);

      expect(report).toContain('暂无测试用例数据');
    });

    it('should show failed metrics correctly', () => {
      const data = createReportData({
        summary: {
          ...createReportData().summary,
          qualityMetrics: [
            { name: 'RC', value: 0.8, threshold: 0.85, passed: false },
          ],
        },
      });
      const report = generateMarkdownReport(data);

      expect(report).toContain('❌ 未通过');
    });

    it('should handle defects without screenshots', () => {
      const data = createReportData({
        defects: [
          {
            id: 'DEF-A001',
            severity: 'minor',
            title: 'Test defect',
            description: 'Description',
            screenshots: [],
            operationSteps: [],
            assertionId: 'A001',
            caseId: 'TC001',
            requirementId: 'REQ001',
            route: '/test',
          },
        ],
      });
      const report = generateMarkdownReport(data);

      expect(report).not.toContain('**截图**:');
    });

    it('should handle different test case statuses', () => {
      const data = createReportData({
        testCases: [
          { caseId: 'TC001', title: 'Test 1', status: 'passed', assertionCount: 1, passedCount: 1, failedCount: 0 },
          { caseId: 'TC002', title: 'Test 2', status: 'error', assertionCount: 1, passedCount: 0, failedCount: 0 },
          { caseId: 'TC003', title: 'Test 3', status: 'pending', assertionCount: 0, passedCount: 0, failedCount: 0 },
        ],
      });
      const report = generateMarkdownReport(data);

      expect(report).toContain('✅ 通过');
      expect(report).toContain('⚠️ 错误');
      expect(report).toContain('⏳ 待执行');
    });
  });

  describe('generateMinimalReport', () => {
    it('should generate minimal report', () => {
      const data = createReportData();
      const report = generateMinimalReport(data);

      expect(report).toContain('# 测试报告摘要 - run-123');
      expect(report).toContain('总缺陷: 2');
      expect(report).toContain('严重: 1');
      expect(report).toContain('主要: 1');
    });

    it('should show warning for critical defects', () => {
      const data = createReportData();
      const report = generateMinimalReport(data);

      expect(report).toContain('⚠️ 存在严重缺陷');
    });

    it('should show success when no critical defects', () => {
      const data = createReportData({
        summary: {
          ...createReportData().summary,
          severityDistribution: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        },
      });
      const report = generateMinimalReport(data);

      expect(report).toContain('✅ 无严重缺陷');
    });
  });
});

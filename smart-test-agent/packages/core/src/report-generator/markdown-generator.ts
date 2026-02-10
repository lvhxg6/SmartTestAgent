/**
 * Markdown Report Generator
 * Generates Markdown format test reports
 * @see Requirements 10.2, 10.3, 10.4, 10.5
 */

import type {
  ReportData,
  DefectReport,
  TestCaseSummary,
  QualityMetric,
  DefectSeverity,
} from '@smart-test-agent/shared';

/**
 * Generate complete Markdown report
 * @see Requirements 10.2, 10.3, 10.4, 10.5
 */
export function generateMarkdownReport(data: ReportData): string {
  const sections: string[] = [];

  // Header
  sections.push(generateHeader(data.runId, data.generatedAt));

  // Summary
  sections.push(generateSummary(data.summary));

  // Quality Metrics
  sections.push(generateQualityMetrics(data.summary.qualityMetrics));

  // Defect List
  if (data.defects.length > 0) {
    sections.push(generateDefectList(data.defects));
  } else {
    sections.push('## 缺陷列表\n\n无缺陷发现。');
  }

  // Test Case Summary
  sections.push(generateTestCaseSummary(data.testCases));

  return sections.join('\n\n---\n\n');
}

/**
 * Generate report header
 */
function generateHeader(runId: string, generatedAt: string): string {
  const timestamp = new Date(generatedAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `# 测试报告 - ${runId}

**生成时间**: ${timestamp}`;
}

/**
 * Generate summary section
 * @see Requirements 10.5
 */
function generateSummary(summary: ReportData['summary']): string {
  const severityText = Object.entries(summary.severityDistribution)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${getSeverityLabel(severity as DefectSeverity)}: ${count}`)
    .join(', ');

  const routesText = summary.affectedRoutes.length > 0
    ? summary.affectedRoutes.map((r) => `\`${r}\``).join(', ')
    : '无';

  return `## 摘要

- **总缺陷数**: ${summary.totalDefects}
- **严重程度分布**: ${severityText || '无'}
- **受影响路由**: ${routesText}`;
}

/**
 * Generate quality metrics table
 * @see Requirements 10.5
 */
function generateQualityMetrics(metrics: QualityMetric[]): string {
  if (metrics.length === 0) {
    return '## 质量指标\n\n暂无质量指标数据。';
  }

  const rows = metrics.map((m) => {
    const status = m.passed ? '✅ 通过' : '❌ 未通过';
    const value = (m.value * 100).toFixed(1) + '%';
    const threshold = (m.threshold * 100).toFixed(1) + '%';
    return `| ${getMetricLabel(m.name)} | ${value} | ≥${threshold} | ${status} |`;
  });

  return `## 质量指标

| 指标 | 值 | 阈值 | 状态 |
|------|-----|------|------|
${rows.join('\n')}`;
}

/**
 * Generate defect list section
 * @see Requirements 10.2, 10.3
 */
function generateDefectList(defects: DefectReport[]): string {
  const defectSections = defects.map((defect, index) => {
    return generateDefectSection(defect, index + 1);
  });

  return `## 缺陷列表

${defectSections.join('\n\n---\n\n')}`;
}

/**
 * Generate single defect section
 * @see Requirements 10.2, 10.3
 */
function generateDefectSection(defect: DefectReport, index: number): string {
  const parts: string[] = [];

  // Title with severity badge
  const severityBadge = getSeverityBadge(defect.severity);
  parts.push(`### 缺陷 ${index}: ${defect.title}`);
  parts.push(`**严重程度**: ${severityBadge}`);

  // Description
  parts.push(`**描述**:\n\n${defect.description}`);

  // Operation steps
  if (defect.operationSteps.length > 0) {
    parts.push(`**操作步骤**:\n\n${defect.operationSteps.join('\n')}`);
  }

  // Screenshots
  if (defect.screenshots.length > 0) {
    const screenshotLinks = defect.screenshots
      .map((path, i) => `![截图 ${i + 1}](${path})`)
      .join('\n\n');
    parts.push(`**截图**:\n\n${screenshotLinks}`);
  }

  // Metadata
  parts.push(`**关联信息**:
- 断言ID: \`${defect.assertionId}\`
- 用例ID: \`${defect.caseId}\`
- 需求ID: \`${defect.requirementId}\`
- 路由: \`${defect.route}\``);

  return parts.join('\n\n');
}

/**
 * Generate test case summary table
 * @see Requirements 10.5
 */
function generateTestCaseSummary(testCases: TestCaseSummary[]): string {
  if (testCases.length === 0) {
    return '## 测试用例汇总\n\n暂无测试用例数据。';
  }

  const rows = testCases.map((tc) => {
    const statusIcon = getStatusIcon(tc.status);
    return `| ${tc.caseId} | ${tc.title} | ${statusIcon} | ${tc.passedCount}/${tc.assertionCount} |`;
  });

  return `## 测试用例汇总

| 用例ID | 标题 | 状态 | 断言通过 |
|--------|------|------|----------|
${rows.join('\n')}`;
}

/**
 * Get severity label in Chinese
 */
function getSeverityLabel(severity: DefectSeverity): string {
  const labels: Record<DefectSeverity, string> = {
    critical: '严重',
    major: '主要',
    minor: '次要',
    suggestion: '建议',
  };
  return labels[severity];
}

/**
 * Get severity badge with emoji
 */
function getSeverityBadge(severity: DefectSeverity): string {
  const badges: Record<DefectSeverity, string> = {
    critical: '🔴 严重 (Critical)',
    major: '🟠 主要 (Major)',
    minor: '🟡 次要 (Minor)',
    suggestion: '🔵 建议 (Suggestion)',
  };
  return badges[severity];
}

/**
 * Get metric label in Chinese
 */
function getMetricLabel(name: string): string {
  const labels: Record<string, string> = {
    RC: '需求覆盖率 (RC)',
    APR: '断言通过率 (APR)',
    FR: '不稳定率 (FR)',
  };
  return labels[name] || name;
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    passed: '✅ 通过',
    failed: '❌ 失败',
    error: '⚠️ 错误',
    pending: '⏳ 待执行',
    running: '🔄 执行中',
  };
  return icons[status] || status;
}

/**
 * Generate minimal report (for quick preview)
 */
export function generateMinimalReport(data: ReportData): string {
  const criticalCount = data.summary.severityDistribution.critical || 0;
  const majorCount = data.summary.severityDistribution.major || 0;

  return `# 测试报告摘要 - ${data.runId}

- 总缺陷: ${data.summary.totalDefects}
- 严重: ${criticalCount}, 主要: ${majorCount}
- 受影响路由: ${data.summary.affectedRoutes.length}

${criticalCount > 0 ? '⚠️ 存在严重缺陷，请立即处理！' : '✅ 无严重缺陷'}`;
}

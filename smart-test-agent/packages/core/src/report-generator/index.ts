/**
 * Report Generator Module
 * Generates Markdown test reports
 * @see Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

// Defect Aggregator
export {
  aggregateDefects,
  determineSeverity,
  groupDefectsBySeverity,
  groupDefectsByRoute,
  countDefectsBySeverity,
  getAffectedRoutes,
  sortDefectsBySeverity,
} from './defect-aggregator.js';

// Markdown Generator
export {
  generateMarkdownReport,
  generateMinimalReport,
} from './markdown-generator.js';

import type {
  Assertion,
  TestCase,
  Requirement,
  ReportData,
  TestCaseSummary,
  QualityMetric,
  DefectSeverity,
} from '@smart-test-agent/shared';
import { aggregateDefects, countDefectsBySeverity, getAffectedRoutes } from './defect-aggregator.js';
import { generateMarkdownReport, generateMinimalReport } from './markdown-generator.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Report generation options
 */
export interface ReportGenerationOptions {
  runId: string;
  outputDir: string;
  qualityMetrics?: QualityMetric[];
}

/**
 * Report Generator class
 */
export class ReportGenerator {
  /**
   * Generate report data from test results
   */
  generateReportData(
    assertions: Assertion[],
    testCases: TestCase[],
    requirements: Requirement[],
    options: ReportGenerationOptions
  ): ReportData {
    // Aggregate defects
    const defects = aggregateDefects(assertions, testCases, requirements);

    // Count by severity
    const severityDistribution = countDefectsBySeverity(defects);

    // Get affected routes
    const affectedRoutes = getAffectedRoutes(defects);

    // Generate test case summaries
    const testCaseSummaries = this.generateTestCaseSummaries(testCases, assertions);

    return {
      runId: options.runId,
      summary: {
        totalDefects: defects.length,
        severityDistribution: severityDistribution as Record<DefectSeverity, number>,
        affectedRoutes,
        qualityMetrics: options.qualityMetrics || [],
      },
      defects,
      testCases: testCaseSummaries,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate test case summaries
   */
  private generateTestCaseSummaries(
    testCases: TestCase[],
    assertions: Assertion[]
  ): TestCaseSummary[] {
    // Group assertions by case ID
    const assertionsByCaseId = new Map<string, Assertion[]>();
    for (const assertion of assertions) {
      const existing = assertionsByCaseId.get(assertion.caseId) || [];
      existing.push(assertion);
      assertionsByCaseId.set(assertion.caseId, existing);
    }

    return testCases.map((tc) => {
      const caseAssertions = assertionsByCaseId.get(tc.caseId) || [];
      const passedCount = caseAssertions.filter((a) => a.finalVerdict === 'pass').length;
      const failedCount = caseAssertions.filter((a) => a.finalVerdict === 'fail').length;

      let status: 'passed' | 'failed' | 'error' | 'pending' = 'pending';
      if (tc.status) {
        status = tc.status as 'passed' | 'failed' | 'error' | 'pending';
      } else if (failedCount > 0) {
        status = 'failed';
      } else if (passedCount === caseAssertions.length && caseAssertions.length > 0) {
        status = 'passed';
      }

      return {
        caseId: tc.caseId,
        title: tc.title,
        status,
        assertionCount: caseAssertions.length,
        passedCount,
        failedCount,
      };
    });
  }

  /**
   * Generate and save Markdown report
   */
  generateReport(
    assertions: Assertion[],
    testCases: TestCase[],
    requirements: Requirement[],
    options: ReportGenerationOptions
  ): { reportPath: string; content: string; data: ReportData } {
    // Generate report data
    const data = this.generateReportData(assertions, testCases, requirements, options);

    // Generate Markdown content
    const content = generateMarkdownReport(data);

    // Save to file
    const reportPath = path.join(options.outputDir, `report-${options.runId}.md`);
    
    // Ensure directory exists
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(reportPath, content, 'utf-8');

    return { reportPath, content, data };
  }

  /**
   * Generate minimal report for quick preview
   */
  generateMinimalReport(data: ReportData): string {
    return generateMinimalReport(data);
  }
}

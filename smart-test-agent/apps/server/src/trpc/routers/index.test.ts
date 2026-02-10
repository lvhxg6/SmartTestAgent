/**
 * App Router Tests
 * Unit tests for the main tRPC router configuration
 * @see Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

import { describe, it, expect } from 'vitest';
import { appRouter } from './index.js';

describe('App Router', () => {
  it('should have health router', () => {
    expect(appRouter._def.procedures).toHaveProperty('health.check');
    expect(appRouter._def.procedures).toHaveProperty('health.ping');
  });

  it('should have project router', () => {
    expect(appRouter._def.procedures).toHaveProperty('project.list');
    expect(appRouter._def.procedures).toHaveProperty('project.getById');
    expect(appRouter._def.procedures).toHaveProperty('project.create');
    expect(appRouter._def.procedures).toHaveProperty('project.update');
    expect(appRouter._def.procedures).toHaveProperty('project.delete');
  });

  it('should have targetProfile router', () => {
    expect(appRouter._def.procedures).toHaveProperty('targetProfile.getByProjectId');
    expect(appRouter._def.procedures).toHaveProperty('targetProfile.upsert');
    expect(appRouter._def.procedures).toHaveProperty('targetProfile.validate');
    expect(appRouter._def.procedures).toHaveProperty('targetProfile.delete');
  });

  it('should have testRun router', () => {
    expect(appRouter._def.procedures).toHaveProperty('testRun.list');
    expect(appRouter._def.procedures).toHaveProperty('testRun.getById');
    expect(appRouter._def.procedures).toHaveProperty('testRun.getStatus');
    expect(appRouter._def.procedures).toHaveProperty('testRun.create');
    expect(appRouter._def.procedures).toHaveProperty('testRun.submitApproval');
    expect(appRouter._def.procedures).toHaveProperty('testRun.submitConfirmation');
  });

  it('should have report router', () => {
    expect(appRouter._def.procedures).toHaveProperty('report.getByRunId');
    expect(appRouter._def.procedures).toHaveProperty('report.getMarkdown');
    expect(appRouter._def.procedures).toHaveProperty('report.getDefects');
    expect(appRouter._def.procedures).toHaveProperty('report.getScreenshot');
    expect(appRouter._def.procedures).toHaveProperty('report.getQualityMetrics');
  });
});

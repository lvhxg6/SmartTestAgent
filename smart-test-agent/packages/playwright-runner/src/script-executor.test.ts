/**
 * Unit tests for Script Executor
 * @see Requirements 7.3, 7.4, 7.5, 7.7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  collectScreenshots,
  parsePlaywrightError,
  ensureWorkspaceDirectories,
} from './script-executor.js';

describe('Script Executor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('collectScreenshots', () => {
    it('should collect screenshots from directory', () => {
      const screenshotDir = path.join(tempDir, 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });

      // Create mock screenshot files
      fs.writeFileSync(path.join(screenshotDir, 'TC001-step1-1234567890.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'TC001-step2-1234567891.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'TC002-step1-1234567892.png'), '');

      const screenshots = collectScreenshots(screenshotDir, 'run-123');

      expect(screenshots).toHaveLength(3);
      expect(screenshots[0].caseId).toBe('TC001');
      expect(screenshots[0].stepNumber).toBe(1);
      expect(screenshots[1].stepNumber).toBe(2);
      expect(screenshots[2].caseId).toBe('TC002');
    });

    it('should return empty array for non-existent directory', () => {
      const screenshots = collectScreenshots('/non/existent/path', 'run-123');
      expect(screenshots).toHaveLength(0);
    });

    it('should ignore non-image files', () => {
      const screenshotDir = path.join(tempDir, 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });

      fs.writeFileSync(path.join(screenshotDir, 'TC001-step1-1234567890.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'readme.txt'), '');
      fs.writeFileSync(path.join(screenshotDir, 'data.json'), '');

      const screenshots = collectScreenshots(screenshotDir, 'run-123');

      expect(screenshots).toHaveLength(1);
    });

    it('should handle jpeg files', () => {
      const screenshotDir = path.join(tempDir, 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });

      fs.writeFileSync(path.join(screenshotDir, 'TC001-step1-1234567890.jpg'), '');
      fs.writeFileSync(path.join(screenshotDir, 'TC001-step2-1234567891.jpeg'), '');

      const screenshots = collectScreenshots(screenshotDir, 'run-123');

      expect(screenshots).toHaveLength(2);
    });

    it('should sort screenshots by case ID and step number', () => {
      const screenshotDir = path.join(tempDir, 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });

      fs.writeFileSync(path.join(screenshotDir, 'TC002-step1-1234567890.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'TC001-step2-1234567891.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'TC001-step1-1234567892.png'), '');

      const screenshots = collectScreenshots(screenshotDir, 'run-123');

      expect(screenshots[0].caseId).toBe('TC001');
      expect(screenshots[0].stepNumber).toBe(1);
      expect(screenshots[1].caseId).toBe('TC001');
      expect(screenshots[1].stepNumber).toBe(2);
      expect(screenshots[2].caseId).toBe('TC002');
    });

    it('should ignore files with invalid naming pattern', () => {
      const screenshotDir = path.join(tempDir, 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });

      fs.writeFileSync(path.join(screenshotDir, 'TC001-step1-1234567890.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'invalid-name.png'), '');
      fs.writeFileSync(path.join(screenshotDir, 'screenshot.png'), '');

      const screenshots = collectScreenshots(screenshotDir, 'run-123');

      expect(screenshots).toHaveLength(1);
    });
  });

  describe('parsePlaywrightError', () => {
    it('should detect element not found errors', () => {
      const result = parsePlaywrightError('Error: element not found: .my-button');
      expect(result.reasonCode).toBe('playwright_error');
      expect(result.details).toContain('Element not found');
    });

    it('should detect locator errors', () => {
      const result = parsePlaywrightError('Error: locator resolved to 0 elements');
      expect(result.reasonCode).toBe('playwright_error');
      expect(result.details).toContain('Element not found');
    });

    it('should detect waiting for selector errors', () => {
      const result = parsePlaywrightError('Error: waiting for selector ".button" failed');
      expect(result.reasonCode).toBe('playwright_error');
      expect(result.details).toContain('Element not found');
    });

    it('should detect timeout errors', () => {
      const result = parsePlaywrightError('Error: Timeout 30000ms exceeded');
      expect(result.reasonCode).toBe('agent_timeout');
      expect(result.details).toContain('timed out');
    });

    it('should detect timed out errors', () => {
      const result = parsePlaywrightError('Error: Operation timed out');
      expect(result.reasonCode).toBe('agent_timeout');
    });

    it('should detect navigation errors', () => {
      const result = parsePlaywrightError('Error: Navigation failed: net::ERR_CONNECTION_REFUSED');
      expect(result.reasonCode).toBe('playwright_error');
      expect(result.details).toContain('Navigation');
    });

    it('should detect failed to load errors', () => {
      const result = parsePlaywrightError('Error: Failed to load resource');
      expect(result.reasonCode).toBe('playwright_error');
      expect(result.details).toContain('Navigation');
    });

    it('should default to playwright_error for unknown errors', () => {
      const result = parsePlaywrightError('Some unknown error occurred');
      expect(result.reasonCode).toBe('playwright_error');
    });

    it('should truncate long error messages', () => {
      const longError = 'A'.repeat(500);
      const result = parsePlaywrightError(longError);
      expect(result.details.length).toBeLessThanOrEqual(200);
    });
  });

  describe('ensureWorkspaceDirectories', () => {
    it('should create required directories', () => {
      const workspacePath = path.join(tempDir, 'workspace');

      const result = ensureWorkspaceDirectories(workspacePath);

      expect(fs.existsSync(result.screenshotDir)).toBe(true);
      expect(fs.existsSync(result.traceDir)).toBe(true);
      expect(result.outputDir).toBe(workspacePath);
    });

    it('should return correct paths', () => {
      const workspacePath = path.join(tempDir, 'workspace');

      const result = ensureWorkspaceDirectories(workspacePath);

      expect(result.screenshotDir).toBe(path.join(workspacePath, 'evidence', 'screenshots'));
      expect(result.traceDir).toBe(path.join(workspacePath, 'evidence', 'traces'));
      expect(result.outputDir).toBe(workspacePath);
    });

    it('should not fail if directories already exist', () => {
      const workspacePath = path.join(tempDir, 'workspace');
      fs.mkdirSync(path.join(workspacePath, 'evidence', 'screenshots'), { recursive: true });

      expect(() => ensureWorkspaceDirectories(workspacePath)).not.toThrow();
    });
  });
});

/**
 * Unit tests for Script Generator
 * @see Requirements 7.1, 7.2
 */

import { describe, it, expect } from 'vitest';
import { generateTestScript, validateScriptStructure } from './script-generator.js';
import type { TestCase, TargetProfile, Assertion, TestStep } from '@smart-test-agent/shared';

describe('Script Generator', () => {
  const mockProfile: TargetProfile = {
    id: 'profile-1',
    projectId: 'project-1',
    baseUrl: 'https://example.com',
    browser: {
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timeoutMs: 30000,
    },
    login: {
      loginUrl: 'https://example.com/login',
      usernameSelector: '#username',
      passwordSelector: '#password',
      submitSelector: '#submit',
      credentials: {
        username: '$TEST_USERNAME',
        password: '$TEST_PASSWORD',
      },
      successIndicator: '.dashboard',
    },
    allowedRoutes: ['/dashboard', '/users'],
    allowedOperations: ['query', 'view_detail'],
    sourceCode: {
      frontendRoot: './src',
      routerFile: './src/router/index.ts',
      pageDir: './src/pages',
      apiDir: './src/api',
    },
    uiFramework: 'antd',
    antdQuirks: {
      buttonTextSpace: true,
      selectType: 'custom',
      modalCloseSelector: '.ant-modal-close',
    },
  };

  const mockAssertion: Assertion = {
    id: 'assertion-1',
    assertionId: 'A001',
    runId: 'run-1',
    caseId: 'TC001',
    type: 'element_visible',
    description: 'Check element is visible',
    expected: '.success-message',
  };

  const mockStep: TestStep = {
    stepNumber: 1,
    action: 'Click submit button',
    selector: '#submit',
    screenshot: true,
  };

  const mockTestCase: TestCase = {
    id: 'tc-1',
    caseId: 'TC001',
    runId: 'run-1',
    requirementId: 'REQ001',
    route: '/dashboard',
    title: 'Test Dashboard',
    precondition: 'User is logged in',
    steps: [mockStep],
    assertions: [mockAssertion],
  };

  describe('generateTestScript', () => {
    it('should generate a complete test script', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.filename).toBe('test-run-123.js');
      expect(result.testCaseIds).toContain('TC001');
      expect(result.content).toBeTruthy();
    });

    it('should include browser configuration', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('baseUrl:');
      expect(result.content).toContain('https://example.com');
      expect(result.content).toContain('viewport:');
      expect(result.content).toContain('1920');
      expect(result.content).toContain('1080');
    });

    it('should include login configuration', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('LOGIN_CONFIG');
      expect(result.content).toContain('#username');
      expect(result.content).toContain('#password');
      expect(result.content).toContain('.dashboard');
    });

    it('should include helper functions', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('async function takeScreenshot');
      expect(result.content).toContain('async function scrollIntoViewIfNeeded');
      expect(result.content).toContain('function createResult');
    });

    it('should include test case execution code', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('TC001');
      expect(result.content).toContain('Test Dashboard');
      expect(result.content).toContain('/dashboard');
    });

    it('should include assertion code', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('A001');
      expect(result.content).toContain('.success-message');
    });

    it('should handle multiple test cases', () => {
      const testCase2: TestCase = {
        ...mockTestCase,
        id: 'tc-2',
        caseId: 'TC002',
        title: 'Test Users',
        route: '/users',
      };

      const result = generateTestScript([mockTestCase, testCase2], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.testCaseIds).toContain('TC001');
      expect(result.testCaseIds).toContain('TC002');
      expect(result.content).toContain('TC001');
      expect(result.content).toContain('TC002');
    });

    it('should include data preparation code when present', () => {
      const testCaseWithData: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: 'users', data: { name: 'Test User' } },
        ],
      };

      const result = generateTestScript([testCaseWithData], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('Data preparation');
    });

    it('should include data cleanup code when present', () => {
      const testCaseWithCleanup: TestCase = {
        ...mockTestCase,
        dataCleanup: [
          { action: 'delete', target: 'users', data: { id: '123' } },
        ],
      };

      const result = generateTestScript([testCaseWithCleanup], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('Data cleanup');
      expect(result.content).toContain('finally');
    });

    it('should include entry point', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('runTests()');
      expect(result.content).toContain('.then(');
      expect(result.content).toContain('execution-results.json');
    });
  });

  describe('validateScriptStructure', () => {
    it('should validate a complete script', () => {
      const result = generateTestScript([mockTestCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      const validation = validateScriptStructure(result.content);
      expect(validation.valid).toBe(true);
      expect(validation.missingParts).toHaveLength(0);
    });

    it('should detect missing imports', () => {
      const incompleteScript = `
        const CONFIG = {};
        async function runTests() {}
      `;

      const validation = validateScriptStructure(incompleteScript);
      expect(validation.valid).toBe(false);
      expect(validation.missingParts).toContain('imports');
    });

    it('should detect missing config', () => {
      const incompleteScript = `
        const { chromium } = require('playwright');
        async function runTests() {}
      `;

      const validation = validateScriptStructure(incompleteScript);
      expect(validation.valid).toBe(false);
      expect(validation.missingParts).toContain('config');
    });

    it('should detect missing login config', () => {
      const incompleteScript = `
        const { chromium } = require('playwright');
        const CONFIG = {};
        async function runTests() {}
      `;

      const validation = validateScriptStructure(incompleteScript);
      expect(validation.valid).toBe(false);
      expect(validation.missingParts).toContain('login_config');
    });

    it('should detect missing main function', () => {
      const incompleteScript = `
        const { chromium } = require('playwright');
        const CONFIG = {};
        const LOGIN_CONFIG = {};
      `;

      const validation = validateScriptStructure(incompleteScript);
      expect(validation.valid).toBe(false);
      expect(validation.missingParts).toContain('main_function');
    });

    it('should detect missing entry point', () => {
      const incompleteScript = `
        const { chromium } = require('playwright');
        const CONFIG = {};
        const LOGIN_CONFIG = {};
        async function takeScreenshot() {}
        async function performLogin() {}
        async function runTests() {
          await chromium.launch();
          await browser.newContext();
        }
      `;

      const validation = validateScriptStructure(incompleteScript);
      expect(validation.valid).toBe(false);
      expect(validation.missingParts).toContain('entry_point');
    });
  });

  describe('assertion types', () => {
    it('should generate element_visible assertion code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        assertions: [{
          ...mockAssertion,
          type: 'element_visible',
          expected: '.success-message',
        }],
      };

      const result = generateTestScript([testCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('isVisible');
    });

    it('should generate text_content assertion code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        assertions: [{
          ...mockAssertion,
          type: 'text_content',
          expected: 'Success',
        }],
      };

      const result = generateTestScript([testCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('textContent');
      expect(result.content).toContain('includes');
    });

    it('should generate element_count assertion code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        assertions: [{
          ...mockAssertion,
          type: 'element_count',
          expected: '.item|5',
        }],
      };

      const result = generateTestScript([testCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('count');
    });

    it('should generate navigation assertion code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        assertions: [{
          ...mockAssertion,
          type: 'navigation',
          expected: '/dashboard',
        }],
      };

      const result = generateTestScript([testCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('page.url()');
    });

    it('should generate soft assertion code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        assertions: [{
          ...mockAssertion,
          type: 'soft',
          expected: 'Visual check',
        }],
      };

      const result = generateTestScript([testCase], mockProfile, {
        runId: 'run-123',
        outputDir: '/output',
        screenshotDir: '/output/screenshots',
      });

      expect(result.content).toContain('Soft assertion');
      expect(result.content).toContain('pending_review');
    });
  });
});

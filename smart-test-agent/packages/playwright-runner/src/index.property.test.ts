/**
 * Property-Based Tests for Playwright Runner
 * **Validates: Requirements 4.2, 4.3, 4.4, 7.1, 7.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isTwoChineseChars,
  generateButtonSelector,
  generateSelectorByPriority,
  SELECTOR_PRIORITY,
  type SelectorOptions,
  type ElementDescription,
} from './selector-generator.js';
import { generateTestScript, validateScriptStructure } from './script-generator.js';
import type { TestCase, TargetProfile, Assertion, TestStep } from '@smart-test-agent/shared';

/**
 * Property 4: Ant Design Button Selector Pattern
 * *For any* button text that is exactly two Chinese characters and antd_quirks.button_text_space is true,
 * the generated selector should use a regex pattern with wildcard.
 * **Validates: Requirements 1.7, 4.3, 4.4**
 */
describe('Property 4: Ant Design Button Selector Pattern', () => {
  const antdOptionsWithQuirks: SelectorOptions = {
    uiFramework: 'antd',
    antdQuirks: {
      buttonTextSpace: true,
      selectType: 'custom',
      modalCloseSelector: '.ant-modal-close',
    },
  };

  const antdOptionsWithoutQuirks: SelectorOptions = {
    uiFramework: 'antd',
    antdQuirks: {
      buttonTextSpace: false,
      selectType: 'custom',
      modalCloseSelector: '.ant-modal-close',
    },
  };

  // Arbitrary for generating exactly two Chinese characters
  const twoChineseCharsArb = fc.tuple(
    fc.integer({ min: 0x4e00, max: 0x9fa5 }),
    fc.integer({ min: 0x4e00, max: 0x9fa5 })
  ).map(([c1, c2]) => String.fromCharCode(c1) + String.fromCharCode(c2));

  // Arbitrary for generating three or more Chinese characters
  const threeOrMoreChineseCharsArb = fc.array(
    fc.integer({ min: 0x4e00, max: 0x9fa5 }),
    { minLength: 3, maxLength: 10 }
  ).map(chars => chars.map(c => String.fromCharCode(c)).join(''));

  it('should use regex pattern for two-char Chinese buttons with buttonTextSpace=true', () => {
    fc.assert(
      fc.property(twoChineseCharsArb, (buttonText) => {
        // Precondition: text is exactly two Chinese characters
        expect(isTwoChineseChars(buttonText)).toBe(true);

        const result = generateButtonSelector(buttonText, antdOptionsWithQuirks);

        // Property: selector should use regex pattern
        expect(result.type).toBe('getByRole');
        expect(result.code).toContain('/');
        expect(result.code).toContain('.*');
        expect(result.code).toContain(buttonText[0]);
        expect(result.code).toContain(buttonText[1]);
      }),
      { numRuns: 100 }
    );
  });

  it('should use exact match for two-char Chinese buttons with buttonTextSpace=false', () => {
    fc.assert(
      fc.property(twoChineseCharsArb, (buttonText) => {
        const result = generateButtonSelector(buttonText, antdOptionsWithoutQuirks);

        // Property: selector should use exact match (no regex)
        expect(result.type).toBe('getByRole');
        expect(result.code).not.toContain('.*');
        expect(result.code).toContain(`name: '${buttonText}'`);
      }),
      { numRuns: 100 }
    );
  });

  it('should use exact match for three+ char Chinese buttons regardless of quirks', () => {
    fc.assert(
      fc.property(threeOrMoreChineseCharsArb, (buttonText) => {
        // Precondition: text is NOT exactly two Chinese characters
        expect(isTwoChineseChars(buttonText)).toBe(false);

        const result = generateButtonSelector(buttonText, antdOptionsWithQuirks);

        // Property: selector should use exact match (no regex)
        expect(result.type).toBe('getByRole');
        expect(result.code).not.toContain('.*');
        expect(result.code).toContain(`name: '`);
      }),
      { numRuns: 100 }
    );
  });

  it('should use exact match for non-Chinese buttons regardless of quirks', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/[\u4e00-\u9fa5]/.test(s) && s.trim().length > 0), (buttonText) => {
        const result = generateButtonSelector(buttonText, antdOptionsWithQuirks);

        // Property: selector should use exact match for non-Chinese text
        expect(result.type).toBe('getByRole');
        expect(result.code).not.toContain('.*');
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 9: Selector Priority Ordering
 * *For any* generated Playwright selector, the system should prefer them in the defined priority order.
 * **Validates: Requirements 4.2**
 */
describe('Property 9: Selector Priority Ordering', () => {
  const options: SelectorOptions = {
    uiFramework: 'antd',
  };

  // Arbitrary for element descriptions with various selector info
  const elementDescriptionArb = fc.record({
    role: fc.option(fc.constantFrom('button', 'textbox', 'link', 'checkbox'), { nil: undefined }),
    name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    text: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    placeholder: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    label: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    testId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    css: fc.option(fc.string({ minLength: 1, maxLength: 20 }).map(s => `.${s.replace(/[^a-zA-Z0-9-_]/g, '')}`), { nil: undefined }),
  }).filter(e => {
    // At least one selector info must be present
    return e.role !== undefined || e.text !== undefined || e.placeholder !== undefined ||
           e.label !== undefined || e.testId !== undefined || e.css !== undefined;
  }) as fc.Arbitrary<ElementDescription>;

  it('should always select the highest priority available selector', () => {
    fc.assert(
      fc.property(elementDescriptionArb, (element) => {
        const result = generateSelectorByPriority(element, options);

        // Determine expected priority based on available info
        let expectedType: string;
        if (element.role) {
          expectedType = 'getByRole';
        } else if (element.text) {
          expectedType = 'getByText';
        } else if (element.placeholder) {
          expectedType = 'getByPlaceholder';
        } else if (element.label) {
          expectedType = 'getByLabel';
        } else if (element.testId) {
          expectedType = 'getByTestId';
        } else {
          expectedType = 'css';
        }

        // Property: selected type should match expected priority
        expect(result.type).toBe(expectedType);
      }),
      { numRuns: 100 }
    );
  });

  it('should assign correct priority values', () => {
    fc.assert(
      fc.property(elementDescriptionArb, (element) => {
        const result = generateSelectorByPriority(element, options);

        // Property: priority should match the index in SELECTOR_PRIORITY
        const expectedPriority = SELECTOR_PRIORITY.indexOf(result.type);
        expect(result.priority).toBe(expectedPriority);
      }),
      { numRuns: 100 }
    );
  });

  it('should prefer getByRole over all other selectors when role is available', () => {
    fc.assert(
      fc.property(
        fc.record({
          role: fc.constantFrom('button', 'textbox', 'link'),
          text: fc.string({ minLength: 1, maxLength: 10 }),
          placeholder: fc.string({ minLength: 1, maxLength: 10 }),
          label: fc.string({ minLength: 1, maxLength: 10 }),
          testId: fc.string({ minLength: 1, maxLength: 10 }),
          css: fc.constant('.my-class'),
        }),
        (element) => {
          const result = generateSelectorByPriority(element as ElementDescription, options);

          // Property: getByRole should always be selected when role is present
          expect(result.type).toBe('getByRole');
          expect(result.priority).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 17: Test Script Structure Completeness
 * *For any* generated Playwright test script, the script should contain all required sections.
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Property 17: Test Script Structure Completeness', () => {
  // Create a valid target profile
  const createProfile = (): TargetProfile => ({
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
    allowedRoutes: ['/dashboard'],
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
  });

  // Arbitrary for generating test steps
  const testStepArb = fc.record({
    stepNumber: fc.integer({ min: 1, max: 100 }),
    action: fc.string({ minLength: 5, maxLength: 50 }),
    selector: fc.option(fc.string({ minLength: 1, maxLength: 30 }).map(s => `#${s.replace(/[^a-zA-Z0-9-_]/g, '')}`), { nil: undefined }),
    inputValue: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    screenshot: fc.boolean(),
  }) as fc.Arbitrary<TestStep>;

  // Arbitrary for generating assertions
  const assertionArb = fc.record({
    id: fc.uuid(),
    assertionId: fc.string({ minLength: 3, maxLength: 10 }).map(s => `A${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    runId: fc.constant('run-1'),
    caseId: fc.constant('TC001'),
    type: fc.constantFrom('element_visible', 'text_content', 'navigation', 'soft') as fc.Arbitrary<'element_visible' | 'text_content' | 'navigation' | 'soft'>,
    description: fc.string({ minLength: 5, maxLength: 50 }),
    expected: fc.string({ minLength: 1, maxLength: 30 }),
  }) as fc.Arbitrary<Assertion>;

  // Arbitrary for generating test cases
  const testCaseArb = fc.record({
    id: fc.uuid(),
    caseId: fc.string({ minLength: 3, maxLength: 10 }).map(s => `TC${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    runId: fc.constant('run-1'),
    requirementId: fc.string({ minLength: 3, maxLength: 10 }).map(s => `REQ${s.replace(/[^a-zA-Z0-9]/g, '')}`),
    route: fc.string({ minLength: 1, maxLength: 20 }).map(s => `/${s.replace(/[^a-zA-Z0-9-_]/g, '')}`),
    title: fc.string({ minLength: 5, maxLength: 50 }),
    precondition: fc.string({ minLength: 5, maxLength: 50 }),
    steps: fc.array(testStepArb, { minLength: 1, maxLength: 5 }),
    assertions: fc.array(assertionArb, { minLength: 1, maxLength: 3 }),
  }) as fc.Arbitrary<TestCase>;

  it('should generate valid script structure for any valid test case', () => {
    const profile = createProfile();

    fc.assert(
      fc.property(
        fc.array(testCaseArb, { minLength: 1, maxLength: 3 }),
        fc.uuid(),
        (testCases, runId) => {
          const result = generateTestScript(testCases, profile, {
            runId,
            outputDir: '/output',
            screenshotDir: '/output/screenshots',
          });

          // Property: generated script should pass structure validation
          const validation = validateScriptStructure(result.content);
          expect(validation.valid).toBe(true);
          expect(validation.missingParts).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include all test case IDs in the result', () => {
    const profile = createProfile();

    fc.assert(
      fc.property(
        fc.array(testCaseArb, { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        (testCases, runId) => {
          const result = generateTestScript(testCases, profile, {
            runId,
            outputDir: '/output',
            screenshotDir: '/output/screenshots',
          });

          // Property: all test case IDs should be in the result
          expect(result.testCaseIds).toHaveLength(testCases.length);
          for (const tc of testCases) {
            expect(result.testCaseIds).toContain(tc.caseId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate correct filename format', () => {
    const profile = createProfile();

    fc.assert(
      fc.property(
        fc.array(testCaseArb, { minLength: 1, maxLength: 2 }),
        fc.uuid(),
        (testCases, runId) => {
          const result = generateTestScript(testCases, profile, {
            runId,
            outputDir: '/output',
            screenshotDir: '/output/screenshots',
          });

          // Property: filename should follow the pattern test-{runId}.js
          expect(result.filename).toBe(`test-${runId}.js`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include browser configuration from profile', () => {
    const profile = createProfile();

    fc.assert(
      fc.property(
        fc.array(testCaseArb, { minLength: 1, maxLength: 2 }),
        fc.uuid(),
        (testCases, runId) => {
          const result = generateTestScript(testCases, profile, {
            runId,
            outputDir: '/output',
            screenshotDir: '/output/screenshots',
          });

          // Property: script should contain browser config values
          expect(result.content).toContain(profile.baseUrl);
          expect(result.content).toContain(profile.browser.viewport.width.toString());
          expect(result.content).toContain(profile.browser.viewport.height.toString());
          expect(result.content).toContain(profile.browser.locale);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include login configuration from profile', () => {
    const profile = createProfile();

    fc.assert(
      fc.property(
        fc.array(testCaseArb, { minLength: 1, maxLength: 2 }),
        fc.uuid(),
        (testCases, runId) => {
          const result = generateTestScript(testCases, profile, {
            runId,
            outputDir: '/output',
            screenshotDir: '/output/screenshots',
          });

          // Property: script should contain login config values
          expect(result.content).toContain(profile.login.loginUrl);
          expect(result.content).toContain(profile.login.usernameSelector);
          expect(result.content).toContain(profile.login.passwordSelector);
          expect(result.content).toContain(profile.login.successIndicator);
        }
      ),
      { numRuns: 100 }
    );
  });
});

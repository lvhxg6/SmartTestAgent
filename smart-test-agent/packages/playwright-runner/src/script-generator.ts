/**
 * Playwright Test Script Generator
 * Generates complete executable Playwright JS test scripts
 * @see Requirements 7.1, 7.2
 */

import type {
  TestCase,
  TestStep,
  Assertion,
  DataStep,
  TargetProfile,
  AssertionType,
} from '@smart-test-agent/shared';
import {
  generateButtonSelector,
  generateSelectSelector,
  generateModalCloseSelector,
  generateScrollIntoView,
  escapeString,
  isTwoChineseChars,
  type SelectorOptions,
} from './selector-generator.js';

/**
 * Script generation options
 */
export interface ScriptGenerationOptions {
  runId: string;
  outputDir: string;
  screenshotDir: string;
}

/**
 * Generated script result
 */
export interface GeneratedScript {
  filename: string;
  content: string;
  testCaseIds: string[];
}

/**
 * Generate complete Playwright test script
 * @see Requirements 7.1, 7.2
 */
export function generateTestScript(
  testCases: TestCase[],
  profile: TargetProfile,
  options: ScriptGenerationOptions
): GeneratedScript {
  const { runId, outputDir, screenshotDir } = options;
  const selectorOptions: SelectorOptions = {
    uiFramework: profile.uiFramework,
    antdQuirks: profile.antdQuirks,
  };

  const scriptParts: string[] = [];

  // 1. Script header with imports and configuration
  scriptParts.push(generateScriptHeader(profile, options));

  // 2. Helper functions
  scriptParts.push(generateHelperFunctions());

  // 3. Main execution function
  scriptParts.push(generateMainFunction(testCases, profile, selectorOptions, options));

  // 4. Script entry point
  scriptParts.push(generateEntryPoint());

  return {
    filename: `test-${runId}.js`,
    content: scriptParts.join('\n\n'),
    testCaseIds: testCases.map((tc) => tc.caseId),
  };
}

/**
 * Generate script header with imports
 */
function generateScriptHeader(
  profile: TargetProfile,
  options: ScriptGenerationOptions
): string {
  return `/**
 * Auto-generated Playwright Test Script
 * Run ID: ${options.runId}
 * Generated at: ${new Date().toISOString()}
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: '${escapeString(profile.baseUrl)}',
  timeout: ${profile.browser.timeoutMs},
  viewport: { width: ${profile.browser.viewport.width}, height: ${profile.browser.viewport.height} },
  locale: '${escapeString(profile.browser.locale)}',
  ignoreHTTPSErrors: ${profile.browser.ignoreHTTPSErrors},
  screenshotDir: '${escapeString(options.screenshotDir)}',
  outputDir: '${escapeString(options.outputDir)}',
};

// Login configuration
const LOGIN_CONFIG = {
  loginUrl: '${escapeString(profile.login.loginUrl)}',
  usernameSelector: '${escapeString(profile.login.usernameSelector)}',
  passwordSelector: '${escapeString(profile.login.passwordSelector)}',
  submitSelector: '${escapeString(profile.login.submitSelector)}',
  username: process.env.TEST_USERNAME || '${escapeString(profile.login.credentials.username.replace(/^\$/, ''))}',
  password: process.env.TEST_PASSWORD || '${escapeString(profile.login.credentials.password.replace(/^\$/, ''))}',
  successIndicator: '${escapeString(profile.login.successIndicator)}',
};`;
}

/**
 * Generate helper functions
 */
function generateHelperFunctions(): string {
  return `// Helper functions
async function takeScreenshot(page, name, stepNumber) {
  const filename = \`\${name}-step\${stepNumber}-\${Date.now()}.png\`;
  const filepath = path.join(CONFIG.screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

async function scrollIntoViewIfNeeded(locator) {
  try {
    await locator.scrollIntoViewIfNeeded();
  } catch (e) {
    // Element might already be in view
  }
}

function createResult(caseId, status, steps, assertions, error = null) {
  return {
    caseId,
    status,
    steps,
    assertions,
    error,
    durationMs: 0,
  };
}

function createStepResult(stepNumber, success, error = null, screenshotPath = null) {
  return {
    stepNumber,
    success,
    error,
    screenshotPath,
    durationMs: 0,
  };
}

function createAssertionResult(assertionId, type, expected, actual, verdict, reasoning = null) {
  return {
    assertionId,
    type,
    expected,
    actual,
    machineVerdict: type !== 'soft' ? verdict : null,
    agentVerdict: type === 'soft' ? verdict : null,
    agentReasoning: reasoning,
  };
}`;
}

/**
 * Generate main execution function
 */
function generateMainFunction(
  testCases: TestCase[],
  profile: TargetProfile,
  selectorOptions: SelectorOptions,
  options: ScriptGenerationOptions
): string {
  const testCaseCode = testCases
    .map((tc) => generateTestCaseCode(tc, selectorOptions))
    .join('\n\n');

  return `// Main execution function
async function runTests() {
  const results = {
    runId: '${options.runId}',
    startTime: new Date().toISOString(),
    endTime: null,
    totalDurationMs: 0,
    testCases: [],
    screenshots: [],
    success: true,
    error: null,
  };

  const startTime = Date.now();
  let browser = null;
  let context = null;
  let page = null;

  try {
    // Ensure screenshot directory exists
    if (!fs.existsSync(CONFIG.screenshotDir)) {
      fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
    }

    // Launch browser
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: CONFIG.viewport,
      locale: CONFIG.locale,
      ignoreHTTPSErrors: CONFIG.ignoreHTTPSErrors,
    });
    page = await context.newPage();
    page.setDefaultTimeout(CONFIG.timeout);

    // Perform login
    await performLogin(page);

${testCaseCode}

  } catch (error) {
    results.success = false;
    results.error = error.message;
    results.reasonCode = 'playwright_error';
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  results.endTime = new Date().toISOString();
  results.totalDurationMs = Date.now() - startTime;

  return results;
}

// Login function
async function performLogin(page) {
  await page.goto(LOGIN_CONFIG.loginUrl);
  await page.waitForLoadState('networkidle');
  
  await page.locator(LOGIN_CONFIG.usernameSelector).fill(LOGIN_CONFIG.username);
  await page.locator(LOGIN_CONFIG.passwordSelector).fill(LOGIN_CONFIG.password);
  await page.locator(LOGIN_CONFIG.submitSelector).click();
  
  // Wait for successful login
  await page.waitForSelector(LOGIN_CONFIG.successIndicator, { timeout: CONFIG.timeout });
}`;
}

/**
 * Generate code for a single test case
 */
function generateTestCaseCode(testCase: TestCase, selectorOptions: SelectorOptions): string {
  const { caseId, title, route, steps, assertions, dataPreparation, dataCleanup } = testCase;

  const parts: string[] = [];

  parts.push(`    // Test Case: ${caseId} - ${escapeString(title)}`);
  parts.push(`    {`);
  parts.push(`      const caseStartTime = Date.now();`);
  parts.push(`      const stepResults = [];`);
  parts.push(`      const assertionResults = [];`);
  parts.push(`      let caseError = null;`);
  parts.push(`      let caseStatus = 'passed';`);
  parts.push(``);
  parts.push(`      try {`);

  // Data preparation
  if (dataPreparation && dataPreparation.length > 0) {
    parts.push(`        // Data preparation`);
    dataPreparation.forEach((step, idx) => {
      parts.push(generateDataStepCode(step, idx, 'preparation'));
    });
    parts.push(``);
  }

  // Navigate to route
  parts.push(`        // Navigate to route`);
  parts.push(`        await page.goto(CONFIG.baseUrl + '${escapeString(route)}');`);
  parts.push(`        await page.waitForLoadState('networkidle');`);
  parts.push(``);

  // Execute steps
  parts.push(`        // Execute test steps`);
  steps.forEach((step) => {
    parts.push(generateStepCode(step, selectorOptions, caseId));
  });

  // Execute assertions
  parts.push(``);
  parts.push(`        // Execute assertions`);
  assertions.forEach((assertion) => {
    parts.push(generateAssertionCode(assertion, selectorOptions));
  });

  parts.push(`      } catch (error) {`);
  parts.push(`        caseError = error.message;`);
  parts.push(`        caseStatus = 'error';`);
  parts.push(`      } finally {`);

  // Data cleanup (always executed)
  if (dataCleanup && dataCleanup.length > 0) {
    parts.push(`        // Data cleanup (always executed)`);
    parts.push(`        try {`);
    dataCleanup.forEach((step, idx) => {
      parts.push(`          ${generateDataStepCode(step, idx, 'cleanup')}`);
    });
    parts.push(`        } catch (cleanupError) {`);
    parts.push(`          console.error('Cleanup error:', cleanupError.message);`);
    parts.push(`        }`);
  }

  parts.push(`      }`);
  parts.push(``);
  parts.push(`      results.testCases.push(createResult(`);
  parts.push(`        '${caseId}',`);
  parts.push(`        caseStatus,`);
  parts.push(`        stepResults,`);
  parts.push(`        assertionResults,`);
  parts.push(`        caseError`);
  parts.push(`      ));`);
  parts.push(`    }`);

  return parts.join('\n');
}

/**
 * Generate code for a test step
 */
function generateStepCode(
  step: TestStep,
  selectorOptions: SelectorOptions,
  caseId: string
): string {
  const { stepNumber, action, selector, inputValue, screenshot } = step;
  const parts: string[] = [];

  parts.push(`        // Step ${stepNumber}: ${escapeString(action)}`);
  parts.push(`        {`);
  parts.push(`          const stepStart = Date.now();`);
  parts.push(`          let stepError = null;`);
  parts.push(`          let screenshotPath = null;`);
  parts.push(`          try {`);

  if (selector) {
    // Generate appropriate selector code based on action
    const selectorCode = generateSelectorCode(selector, action, inputValue, selectorOptions);
    parts.push(`            ${selectorCode}`);
  }

  if (screenshot) {
    parts.push(`            screenshotPath = await takeScreenshot(page, '${caseId}', ${stepNumber});`);
    parts.push(`            results.screenshots.push({ caseId: '${caseId}', stepNumber: ${stepNumber}, path: screenshotPath, timestamp: new Date().toISOString() });`);
  }

  parts.push(`          } catch (error) {`);
  parts.push(`            stepError = error.message;`);
  parts.push(`          }`);
  parts.push(`          stepResults.push(createStepResult(${stepNumber}, !stepError, stepError, screenshotPath));`);
  parts.push(`        }`);

  return parts.join('\n');
}

/**
 * Generate selector code based on action type
 */
function generateSelectorCode(
  selector: string,
  action: string,
  inputValue: string | undefined,
  selectorOptions: SelectorOptions
): string {
  const actionLower = action.toLowerCase();

  // Handle button clicks with Ant Design quirks
  if (actionLower.includes('click') && actionLower.includes('button')) {
    const buttonText = extractButtonText(action);
    if (buttonText) {
      const buttonSelector = generateButtonSelector(buttonText, selectorOptions);
      return `await ${buttonSelector.code}.click();`;
    }
  }

  // Handle select operations
  if (actionLower.includes('select') && selectorOptions.uiFramework === 'antd') {
    const selectSelector = generateSelectSelector(selector, selectorOptions);
    if (inputValue) {
      return `await ${selectSelector.trigger}.click();\nawait ${selectSelector.option(inputValue)}.click();`;
    }
  }

  // Handle modal close
  if (actionLower.includes('close') && actionLower.includes('modal')) {
    return `await ${generateModalCloseSelector(selectorOptions)}.click();`;
  }

  // Handle input/fill actions
  if (actionLower.includes('fill') || actionLower.includes('input') || actionLower.includes('type')) {
    if (inputValue) {
      return `await page.locator('${escapeString(selector)}').fill('${escapeString(inputValue)}');`;
    }
  }

  // Handle click actions
  if (actionLower.includes('click')) {
    return `await page.locator('${escapeString(selector)}').click();`;
  }

  // Handle scroll actions
  if (actionLower.includes('scroll')) {
    return `await page.locator('${escapeString(selector)}').scrollIntoViewIfNeeded();`;
  }

  // Default: just locate and interact
  return `await page.locator('${escapeString(selector)}').click();`;
}

/**
 * Extract button text from action description
 */
function extractButtonText(action: string): string | null {
  // Match patterns like "click '确定' button" or "click button '保存'"
  const patterns = [
    /click\s+['"]([^'"]+)['"]\s+button/i,
    /click\s+button\s+['"]([^'"]+)['"]/i,
    /点击\s*['"]([^'"]+)['"]\s*按钮/,
    /点击\s*按钮\s*['"]([^'"]+)['"]/,
  ];

  for (const pattern of patterns) {
    const match = action.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Generate assertion code
 */
function generateAssertionCode(assertion: Assertion, selectorOptions: SelectorOptions): string {
  const { assertionId, type, description, expected } = assertion;
  const parts: string[] = [];

  parts.push(`        // Assertion: ${assertionId} - ${escapeString(description)}`);
  parts.push(`        {`);
  parts.push(`          let actual = null;`);
  parts.push(`          let verdict = 'pass';`);
  parts.push(`          let reasoning = null;`);
  parts.push(`          try {`);

  switch (type) {
    case 'element_visible':
      parts.push(`            const element = page.locator('${escapeString(expected)}');`);
      parts.push(`            await scrollIntoViewIfNeeded(element);`);
      parts.push(`            const isVisible = await element.isVisible();`);
      parts.push(`            actual = isVisible ? 'visible' : 'not visible';`);
      parts.push(`            verdict = isVisible ? 'pass' : 'fail';`);
      break;

    case 'text_content':
      parts.push(`            const textContent = await page.locator('body').textContent();`);
      parts.push(`            actual = textContent.includes('${escapeString(expected)}') ? 'found' : 'not found';`);
      parts.push(`            verdict = actual === 'found' ? 'pass' : 'fail';`);
      break;

    case 'element_count':
      const [selector, countStr] = expected.split('|');
      const expectedCount = parseInt(countStr, 10);
      parts.push(`            const count = await page.locator('${escapeString(selector)}').count();`);
      parts.push(`            actual = count.toString();`);
      parts.push(`            verdict = count === ${expectedCount} ? 'pass' : 'fail';`);
      break;

    case 'navigation':
      parts.push(`            const currentUrl = page.url();`);
      parts.push(`            actual = currentUrl;`);
      parts.push(`            verdict = currentUrl.includes('${escapeString(expected)}') ? 'pass' : 'fail';`);
      break;

    case 'soft':
      // Soft assertions require agent verdict - placeholder for AI review
      parts.push(`            // Soft assertion - requires agent review`);
      parts.push(`            actual = 'pending_review';`);
      parts.push(`            verdict = 'pass'; // Placeholder - will be reviewed by agent`);
      parts.push(`            reasoning = 'Requires manual/AI review';`);
      break;

    default:
      parts.push(`            // Unknown assertion type: ${type}`);
      parts.push(`            verdict = 'error';`);
  }

  parts.push(`          } catch (error) {`);
  parts.push(`            actual = 'error: ' + error.message;`);
  parts.push(`            verdict = 'error';`);
  parts.push(`          }`);
  parts.push(`          assertionResults.push(createAssertionResult('${assertionId}', '${type}', '${escapeString(expected)}', actual, verdict, reasoning));`);
  parts.push(`        }`);

  return parts.join('\n');
}

/**
 * Generate data step code
 */
function generateDataStepCode(step: DataStep, index: number, phase: string): string {
  const { action, target, data } = step;

  switch (action) {
    case 'api_call':
      return `// ${phase} step ${index + 1}: API call to ${target}
        // Note: API calls should be implemented based on target API`;

    case 'create':
    case 'update':
    case 'delete':
      return `// ${phase} step ${index + 1}: ${action} ${target}
        // Data: ${JSON.stringify(data || {})}`;

    default:
      return `// ${phase} step ${index + 1}: Unknown action ${action}`;
  }
}

/**
 * Generate script entry point
 */
function generateEntryPoint(): string {
  return `// Entry point
runTests()
  .then((results) => {
    // Write results to file
    const outputPath = path.join(CONFIG.outputDir, 'execution-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log('Test execution completed. Results written to:', outputPath);
    console.log('Success:', results.success);
    console.log('Test cases executed:', results.testCases.length);
    process.exit(results.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });`;
}

/**
 * Validate test script structure completeness
 * @see Property 17: Test Script Structure Completeness
 */
export function validateScriptStructure(script: string): {
  valid: boolean;
  missingParts: string[];
} {
  const requiredParts = [
    { name: 'imports', pattern: /require\(['"]playwright['"]\)/ },
    { name: 'config', pattern: /const CONFIG\s*=/ },
    { name: 'login_config', pattern: /const LOGIN_CONFIG\s*=/ },
    { name: 'screenshot_function', pattern: /async function takeScreenshot/ },
    { name: 'login_function', pattern: /async function performLogin/ },
    { name: 'main_function', pattern: /async function runTests/ },
    { name: 'browser_launch', pattern: /chromium\.launch/ },
    { name: 'context_creation', pattern: /browser\.newContext/ },
    { name: 'result_output', pattern: /execution-results[\s\S]*writeFileSync/ },
    { name: 'entry_point', pattern: /runTests\(\)\s*\.then/ },
  ];

  const missingParts: string[] = [];

  for (const part of requiredParts) {
    if (!part.pattern.test(script)) {
      missingParts.push(part.name);
    }
  }

  return {
    valid: missingParts.length === 0,
    missingParts,
  };
}

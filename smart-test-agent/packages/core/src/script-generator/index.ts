/**
 * Script Generator Module
 * Generates Playwright test scripts from test cases
 * @see Requirements 6.1, 6.5, 7.1, 7.2
 */

import type { TargetProfile } from '@smart-test-agent/shared';

/**
 * Test case structure for script generation
 */
export interface TestCase {
  case_id: string;
  requirement_id: string;
  title: string;
  precondition?: string;
  route: string;
  steps: TestStep[];
  assertions: TestAssertion[];
  data_preparation?: DataOperation[];
  data_cleanup?: DataOperation[];
  tags?: string[];
}

/**
 * Test step structure
 */
export interface TestStep {
  step_id: string;
  action: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'scroll' | 'hover' | 'check' | 'uncheck';
  target: string;
  value?: string;
  description?: string;
}

/**
 * Test assertion structure
 */
export interface TestAssertion {
  assertion_id: string;
  type: 'element_visible' | 'text_content' | 'element_count' | 'navigation' | 'soft' | 'attribute';
  target: string;
  expected: string;
  description?: string;
}

/**
 * Data operation for preparation/cleanup
 */
export interface DataOperation {
  action: 'api_call' | 'create' | 'delete' | 'update';
  target: string;
  data?: Record<string, unknown>;
  description?: string;
}

/**
 * Generated script result
 */
export interface GeneratedScript {
  caseId: string;
  title: string;
  script: string;
  filename: string;
}

/**
 * Script generator configuration
 */
export interface ScriptGeneratorConfig {
  targetProfile: TargetProfile;
  runId?: string;
}

/**
 * Script Generator
 * Generates Playwright test scripts from test cases
 */
export class ScriptGenerator {
  private config: ScriptGeneratorConfig;

  constructor(config: ScriptGeneratorConfig) {
    this.config = config;
  }

  /**
   * Generate script for a single test case
   * @param testCase Test case to generate script for
   * @returns Generated script
   */
  generateForTestCase(testCase: TestCase): GeneratedScript {
    const script = this.buildTestCaseScript(testCase);
    return {
      caseId: testCase.case_id,
      title: testCase.title,
      script,
      filename: `test-${testCase.case_id.toLowerCase()}.js`,
    };
  }

  /**
   * Generate scripts for multiple test cases
   * @param testCases Test cases to generate scripts for
   * @returns Array of generated scripts
   */
  generateForTestCases(testCases: TestCase[]): GeneratedScript[] {
    return testCases.map(tc => this.generateForTestCase(tc));
  }

  /**
   * Generate a complete executable script for all test cases
   * @param testCases Test cases to include
   * @returns Complete executable script
   */
  generateExecutableScript(testCases: TestCase[]): string {
    const runId = this.config.runId || 'manual';
    const timestamp = new Date().toISOString();
    const profile = this.config.targetProfile;

    return `/**
 * Auto-generated Playwright Test Script
 * Run ID: ${runId}
 * Generated at: ${timestamp}
 * Test Cases: ${testCases.length}
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const config = ${JSON.stringify(this.sanitizeProfile(profile), null, 2)};

const testCases = ${JSON.stringify(testCases, null, 2)};

const runId = '${runId}';

// ============================================================================
// Results Storage
// ============================================================================

const results = {
  run_id: runId,
  started_at: null,
  completed_at: null,
  test_cases: []
};

// ============================================================================
// Utility Functions
// ============================================================================

function resolveEnvVar(value) {
  if (typeof value === 'string' && value.startsWith('$')) {
    return process.env[value.slice(1)] || value;
  }
  return value;
}

async function captureScreenshot(page, name) {
  const dir = 'evidence/screenshots';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const screenshotPath = path.join(dir, \`\${name}.png\`);
  await page.screenshot({ path: screenshotPath });
  return screenshotPath;
}

async function waitForPageLoad(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  results.started_at = new Date().toISOString();
  console.log('🚀 开始执行测试...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: config.browser?.viewport || { width: 1920, height: 1080 },
    locale: config.browser?.locale || 'zh-CN',
    ignoreHTTPSErrors: config.browser?.ignoreHTTPSErrors || false
  });
  
  const page = await context.newPage();
  
  try {
    // Perform login
    await performLogin(page);
    
    // Execute each test case
    for (const testCase of testCases) {
      console.log(\`\\n📋 执行测试用例: \${testCase.case_id} - \${testCase.title}\`);
      const caseResult = await executeTestCase(page, testCase);
      results.test_cases.push(caseResult);
      console.log(\`   状态: \${caseResult.status === 'passed' ? '✅ 通过' : caseResult.status === 'failed' ? '❌ 失败' : '⚠️ 错误'}\`);
    }
  } catch (error) {
    console.error('❌ 致命错误:', error);
  } finally {
    await browser.close();
    
    results.completed_at = new Date().toISOString();
    fs.writeFileSync('execution-results.json', JSON.stringify(results, null, 2));
    console.log('\\n📊 结果已保存到 execution-results.json');
    
    // Print summary
    const passed = results.test_cases.filter(tc => tc.status === 'passed').length;
    const failed = results.test_cases.filter(tc => tc.status === 'failed').length;
    const errors = results.test_cases.filter(tc => tc.status === 'error').length;
    console.log(\`\\n📈 测试摘要: 通过 \${passed}, 失败 \${failed}, 错误 \${errors}, 总计 \${results.test_cases.length}\`);
  }
}

// ============================================================================
// Login
// ============================================================================

async function performLogin(page) {
  const { login } = config;
  if (!login || !login.loginUrl) {
    console.log('⏭️ 跳过登录（未配置）');
    return;
  }
  
  console.log('🔐 执行登录...');
  
  const loginUrl = login.loginUrl.startsWith('http') 
    ? login.loginUrl 
    : \`\${config.baseUrl}\${login.loginUrl}\`;
  
  await page.goto(loginUrl);
  await waitForPageLoad(page);
  
  if (login.usernameSelector && login.credentials?.username) {
    await page.locator(login.usernameSelector).fill(resolveEnvVar(login.credentials.username));
  }
  
  if (login.passwordSelector && login.credentials?.password) {
    await page.locator(login.passwordSelector).fill(resolveEnvVar(login.credentials.password));
  }
  
  if (login.submitSelector) {
    await page.locator(login.submitSelector).click();
  }
  
  if (login.successIndicator) {
    await page.waitForSelector(login.successIndicator, { timeout: 30000 });
  } else {
    await waitForPageLoad(page);
  }
  
  await captureScreenshot(page, '00-login-success');
  console.log('✅ 登录成功');
}

// ============================================================================
// Test Case Execution
// ============================================================================

async function executeTestCase(page, testCase) {
  const caseResult = {
    case_id: testCase.case_id,
    requirement_id: testCase.requirement_id,
    title: testCase.title,
    status: 'passed',
    started_at: new Date().toISOString(),
    steps: [],
    assertions: []
  };
  
  try {
    // Data preparation
    if (testCase.data_preparation && testCase.data_preparation.length > 0) {
      await prepareTestData(page, testCase.data_preparation);
    }
    
    // Execute steps
    for (const step of testCase.steps) {
      const stepResult = await executeStep(page, step, testCase.case_id);
      caseResult.steps.push(stepResult);
      if (stepResult.status === 'error') {
        caseResult.status = 'error';
        break;
      }
    }
    
    // Evaluate assertions
    if (caseResult.status !== 'error') {
      for (const assertion of testCase.assertions) {
        const assertionResult = await evaluateAssertion(page, assertion);
        caseResult.assertions.push(assertionResult);
        if (assertionResult.machine_verdict === 'fail') {
          caseResult.status = 'failed';
        }
      }
    }
  } catch (error) {
    caseResult.status = 'error';
    caseResult.error = error.message;
    await captureScreenshot(page, \`\${testCase.case_id}-error\`);
  } finally {
    // Always cleanup
    if (testCase.data_cleanup && testCase.data_cleanup.length > 0) {
      await cleanupTestData(page, testCase.data_cleanup);
    }
    caseResult.completed_at = new Date().toISOString();
  }
  
  return caseResult;
}

// ============================================================================
// Step Execution
// ============================================================================

async function executeStep(page, step, caseId) {
  const startTime = Date.now();
  const result = {
    step_id: step.step_id,
    action: step.action,
    target: step.target,
    status: 'passed',
    duration_ms: 0
  };
  
  try {
    console.log(\`   ▶️ \${step.step_id}: \${step.action} - \${step.description || step.target}\`);
    
    switch (step.action) {
      case 'navigate':
        const url = step.target.startsWith('http') 
          ? step.target 
          : \`\${config.baseUrl}\${step.target}\`;
        await page.goto(url);
        await waitForPageLoad(page);
        break;
        
      case 'click':
        await page.locator(step.target).scrollIntoViewIfNeeded();
        await page.locator(step.target).click();
        break;
        
      case 'fill':
        await page.locator(step.target).fill(step.value || '');
        break;
        
      case 'select':
        // Ant Design Select handling
        const selectLocator = page.locator(step.target);
        await selectLocator.locator('.ant-select-selector').click().catch(async () => {
          await selectLocator.click();
        });
        await page.waitForSelector('.ant-select-dropdown', { timeout: 5000 });
        await page.locator('.ant-select-item-option').filter({ hasText: step.value }).click();
        break;
        
      case 'wait':
        await page.waitForSelector(step.target, { timeout: 10000 });
        break;
        
      case 'scroll':
        await page.locator(step.target).scrollIntoViewIfNeeded();
        break;
        
      case 'hover':
        await page.locator(step.target).hover();
        break;
        
      case 'check':
        await page.locator(step.target).check();
        break;
        
      case 'uncheck':
        await page.locator(step.target).uncheck();
        break;
        
      default:
        console.warn(\`   ⚠️ 未知操作: \${step.action}\`);
    }
    
    // Small delay for UI to settle
    await page.waitForTimeout(300);
    
    // Capture screenshot after step
    result.screenshot = await captureScreenshot(page, \`\${caseId}-\${step.step_id}\`);
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    result.screenshot = await captureScreenshot(page, \`\${caseId}-\${step.step_id}-error\`);
    console.log(\`   ❌ 步骤失败: \${error.message}\`);
  }
  
  result.duration_ms = Date.now() - startTime;
  return result;
}

// ============================================================================
// Assertion Evaluation
// ============================================================================

async function evaluateAssertion(page, assertion) {
  const result = {
    assertion_id: assertion.assertion_id,
    type: assertion.type,
    target: assertion.target,
    expected: assertion.expected,
    actual: null,
    machine_verdict: null,
    description: assertion.description
  };
  
  try {
    switch (assertion.type) {
      case 'element_visible':
        const isVisible = await page.locator(assertion.target).isVisible();
        result.actual = isVisible ? 'visible' : 'not visible';
        result.machine_verdict = isVisible === (assertion.expected === 'visible' || assertion.expected === 'true') ? 'pass' : 'fail';
        break;
        
      case 'text_content':
        const text = await page.locator(assertion.target).textContent();
        result.actual = text || '';
        result.machine_verdict = result.actual.includes(assertion.expected) ? 'pass' : 'fail';
        break;
        
      case 'element_count':
        const count = await page.locator(assertion.target).count();
        result.actual = count.toString();
        result.machine_verdict = count === parseInt(assertion.expected) ? 'pass' : 'fail';
        break;
        
      case 'navigation':
        const url = page.url();
        result.actual = url;
        result.machine_verdict = url.includes(assertion.expected) ? 'pass' : 'fail';
        break;
        
      case 'attribute':
        const [selector, attrName] = assertion.target.split('@');
        const attrValue = await page.locator(selector).getAttribute(attrName);
        result.actual = attrValue || '';
        result.machine_verdict = result.actual === assertion.expected ? 'pass' : 'fail';
        break;
        
      case 'soft':
        // Soft assertions require AI review
        result.machine_verdict = null;
        result.agent_verdict = 'pending';
        result.agent_reasoning = '需要 AI 审核';
        result.screenshot = await captureScreenshot(page, \`soft-\${assertion.assertion_id}\`);
        break;
        
      default:
        result.machine_verdict = 'error';
        result.error = \`未知断言类型: \${assertion.type}\`;
    }
    
    console.log(\`   🔍 \${assertion.assertion_id}: \${result.machine_verdict === 'pass' ? '✅' : result.machine_verdict === 'fail' ? '❌' : '⏳'} \${assertion.description || assertion.type}\`);
  } catch (error) {
    result.machine_verdict = 'error';
    result.error = error.message;
    console.log(\`   ❌ 断言错误: \${error.message}\`);
  }
  
  return result;
}

// ============================================================================
// Data Management
// ============================================================================

async function prepareTestData(page, preparations) {
  console.log('   📦 准备测试数据...');
  for (const prep of preparations) {
    try {
      console.log(\`      - \${prep.action}: \${prep.description || prep.target}\`);
      // Data preparation implementation depends on specific needs
    } catch (error) {
      console.error(\`      ❌ 数据准备失败: \${error.message}\`);
    }
  }
}

async function cleanupTestData(page, cleanups) {
  console.log('   🧹 清理测试数据...');
  for (const cleanup of cleanups) {
    try {
      console.log(\`      - \${cleanup.action}: \${cleanup.description || cleanup.target}\`);
      // Data cleanup implementation depends on specific needs
    } catch (error) {
      console.error(\`      ❌ 数据清理失败: \${error.message}\`);
    }
  }
}

// ============================================================================
// Run
// ============================================================================

main().catch(console.error);
`;
  }

  /**
   * Build script for a single test case (standalone)
   */
  private buildTestCaseScript(testCase: TestCase): string {
    const profile = this.config.targetProfile;
    const timestamp = new Date().toISOString();

    return `/**
 * Playwright Test Script
 * Test Case: ${testCase.case_id} - ${testCase.title}
 * Requirement: ${testCase.requirement_id}
 * Generated at: ${timestamp}
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const config = ${JSON.stringify(this.sanitizeProfile(profile), null, 2)};

// Test Case
const testCase = ${JSON.stringify(testCase, null, 2)};

async function main() {
  console.log('🚀 执行测试用例: ${testCase.case_id} - ${testCase.title}');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: config.browser?.viewport || { width: 1920, height: 1080 },
    locale: config.browser?.locale || 'zh-CN',
    ignoreHTTPSErrors: config.browser?.ignoreHTTPSErrors || false
  });
  
  const page = await context.newPage();
  
  const result = {
    case_id: testCase.case_id,
    status: 'passed',
    started_at: new Date().toISOString(),
    steps: [],
    assertions: []
  };
  
  try {
    // Login if configured
    if (config.login?.loginUrl) {
      await performLogin(page);
    }
    
    // Navigate to test route
    await page.goto(\`\${config.baseUrl}\${testCase.route}\`);
    await page.waitForLoadState('networkidle').catch(() => {});
    
    // Execute steps
    for (const step of testCase.steps) {
      const stepResult = await executeStep(page, step);
      result.steps.push(stepResult);
      if (stepResult.status === 'error') {
        result.status = 'error';
        break;
      }
    }
    
    // Evaluate assertions
    if (result.status !== 'error') {
      for (const assertion of testCase.assertions) {
        const assertionResult = await evaluateAssertion(page, assertion);
        result.assertions.push(assertionResult);
        if (assertionResult.machine_verdict === 'fail') {
          result.status = 'failed';
        }
      }
    }
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
  } finally {
    await browser.close();
    result.completed_at = new Date().toISOString();
    
    console.log(\`\\n结果: \${result.status === 'passed' ? '✅ 通过' : result.status === 'failed' ? '❌ 失败' : '⚠️ 错误'}\`);
    console.log(JSON.stringify(result, null, 2));
  }
}

async function performLogin(page) {
  const { login } = config;
  const loginUrl = login.loginUrl.startsWith('http') ? login.loginUrl : \`\${config.baseUrl}\${login.loginUrl}\`;
  await page.goto(loginUrl);
  if (login.usernameSelector) await page.locator(login.usernameSelector).fill(login.credentials?.username || '');
  if (login.passwordSelector) await page.locator(login.passwordSelector).fill(login.credentials?.password || '');
  if (login.submitSelector) await page.locator(login.submitSelector).click();
  if (login.successIndicator) await page.waitForSelector(login.successIndicator, { timeout: 30000 });
}

async function executeStep(page, step) {
  const startTime = Date.now();
  const result = { step_id: step.step_id, status: 'passed', duration_ms: 0 };
  try {
    switch (step.action) {
      case 'navigate': await page.goto(\`\${config.baseUrl}\${step.target}\`); break;
      case 'click': await page.locator(step.target).click(); break;
      case 'fill': await page.locator(step.target).fill(step.value || ''); break;
      case 'select':
        await page.locator(step.target).locator('.ant-select-selector').click();
        await page.locator('.ant-select-item-option').filter({ hasText: step.value }).click();
        break;
      case 'wait': await page.waitForSelector(step.target, { timeout: 10000 }); break;
    }
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
  }
  result.duration_ms = Date.now() - startTime;
  return result;
}

async function evaluateAssertion(page, assertion) {
  const result = { assertion_id: assertion.assertion_id, type: assertion.type, expected: assertion.expected, actual: null, machine_verdict: null };
  try {
    switch (assertion.type) {
      case 'element_visible':
        const isVisible = await page.locator(assertion.target).isVisible();
        result.actual = isVisible ? 'visible' : 'not visible';
        result.machine_verdict = isVisible ? 'pass' : 'fail';
        break;
      case 'text_content':
        result.actual = await page.locator(assertion.target).textContent() || '';
        result.machine_verdict = result.actual.includes(assertion.expected) ? 'pass' : 'fail';
        break;
      case 'soft':
        result.machine_verdict = null;
        result.agent_verdict = 'pending';
        break;
    }
  } catch (error) {
    result.machine_verdict = 'error';
    result.error = error.message;
  }
  return result;
}

main().catch(console.error);
`;
  }

  /**
   * Sanitize profile for script embedding (remove sensitive data)
   */
  private sanitizeProfile(profile: TargetProfile): Record<string, unknown> {
    return {
      baseUrl: profile.baseUrl,
      browser: profile.browser,
      login: profile.login ? {
        loginUrl: profile.login.loginUrl,
        usernameSelector: profile.login.usernameSelector,
        passwordSelector: profile.login.passwordSelector,
        submitSelector: profile.login.submitSelector,
        successIndicator: profile.login.successIndicator,
        credentials: {
          username: profile.login.credentials?.username?.startsWith('$') 
            ? profile.login.credentials.username 
            : '$USERNAME',
          password: '$PASSWORD',
        },
      } : undefined,
      allowedRoutes: profile.allowedRoutes,
      uiFramework: profile.uiFramework,
      antdQuirks: profile.antdQuirks,
    };
  }
}

export default ScriptGenerator;

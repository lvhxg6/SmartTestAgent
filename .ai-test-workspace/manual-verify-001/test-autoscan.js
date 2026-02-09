const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const CONFIG = {
  baseUrl: 'https://localhost:8089',
  credentials: { username: 'admin', password: 'Ultrasafe@' },
  route: '#/autoscan',
  screenshotDir: path.join(__dirname, 'evidence/screenshots-v2'),
  outputFile: path.join(__dirname, 'execution-results-v2.json'),
};

// ============ 工具函数 ============
function assert(id, desc, condition, actual) {
  return { assertion_id: id, description: desc, verdict: condition ? 'pass' : 'fail', actual: String(actual) };
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(CONFIG.screenshotDir, `${name}.png`) });
}

// ============ 主流程 ============
(async () => {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const results = [];
  const startTime = Date.now();

  try {
    // ==================== 登录 ====================
    await page.goto(`${CONFIG.baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('input[placeholder="请输入用户名"]').first().fill(CONFIG.credentials.username);
    await page.locator('input[placeholder="请输入密码"]').first().fill(CONFIG.credentials.password);
    const loginBtns = await page.locator('button').all();
    for (const btn of loginBtns) {
      if (await btn.isVisible() && (await btn.textContent()).includes('登')) { await btn.click(); break; }
    }
    await page.waitForURL(/myWork|dashboard|home/i, { timeout: 15000 });
    await screenshot(page, '00-login-success');

    // ==================== 导航到 autoscan ====================
    await page.goto(`${CONFIG.baseUrl}/${CONFIG.route}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '01-autoscan-loaded');

    // ==================== TC-001: 四个Tab展示 ====================
    {
      const tc = { case_id: 'TC-001', title: '页面加载后展示四个Tab', assertions: [] };
      for (const [i, name] of ['基线检测', '弱口令检测', '系统漏洞', '外部漏洞'].entries()) {
        const v = await page.getByRole('tab', { name }).isVisible({ timeout: 5000 }).catch(() => false);
        tc.assertions.push(assert(`A-${i+1}`, `${name}Tab可见`, v, `visible=${v}`));
      }
      await screenshot(page, 'TC-001');
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-002: Tab切换 ====================
    {
      const tc = { case_id: 'TC-002', title: 'Tab切换到弱口令检测', assertions: [] };
      await page.getByRole('tab', { name: '弱口令检测' }).click();
      await page.waitForTimeout(1000);
      const sel = await page.getByRole('tab', { name: '弱口令检测' }).getAttribute('aria-selected');
      tc.assertions.push(assert('A-1', '弱口令检测Tab选中', sel === 'true', `aria-selected=${sel}`));
      await screenshot(page, 'TC-002');
      // Switch back
      await page.getByRole('tab', { name: '基线检测' }).click();
      await page.waitForTimeout(1000);
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-003: 开关和参数区域 ====================
    {
      const tc = { case_id: 'TC-003', title: '开关和参数配置区域展示', assertions: [] };
      const checks = [
        ['A-1', '是否开启标签', '是否开启'],
        ['A-2', '自动下发参数标题', '自动下发参数'],
        ['A-3', '每月开始扫描日期', '每月开始扫描日期'],
        ['A-4', '开始时间', '开始时间'],
        ['A-5', '单个任务下发最大资产数', '单个任务下发最大资产数'],
        ['A-6', '任务超时最大等待时间', '任务超时最大等待时间'],
        ['A-7', '自动任务创建用户', '自动任务创建用户'],
      ];
      for (const [id, desc, text] of checks) {
        const v = await page.getByText(text, { exact: false }).first().isVisible({ timeout: 3000 }).catch(() => false);
        tc.assertions.push(assert(id, desc, v, `visible=${v}`));
      }
      const sw = await page.getByRole('switch').first().isVisible({ timeout: 3000 }).catch(() => false);
      tc.assertions.push(assert('A-8', 'Switch开关可见', sw, `visible=${sw}`));
      await screenshot(page, 'TC-003');
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-004: 盲时/资产/模式区域（滚动） ====================
    {
      const tc = { case_id: 'TC-004', title: '盲时、资产范围、模式区域展示', assertions: [] };
      // 盲时
      const blindBtn = page.getByRole('button', { name: '添加盲时规则' });
      await blindBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      tc.assertions.push(assert('A-1', '添加盲时规则按钮', await blindBtn.isVisible(), 'visible'));
      // 资产范围
      for (const [i, name] of ['全部资产', '仅上报资产', '非上报资产'].entries()) {
        const v = await page.getByRole('radio', { name }).isVisible({ timeout: 3000 }).catch(() => false);
        tc.assertions.push(assert(`A-${i+2}`, `${name}Radio`, v, `visible=${v}`));
      }
      // 模式 - 滚动到底部
      const saveBtn = page.getByRole('button', { name: '保存配置' });
      await saveBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      tc.assertions.push(assert('A-5', '保存配置按钮', await saveBtn.isVisible(), 'visible'));
      await screenshot(page, 'TC-004');
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-005: 操作按钮栏 ====================
    {
      const tc = { case_id: 'TC-005', title: '操作按钮栏', assertions: [] };
      // Scroll back to top
      await page.evaluate(() => document.querySelector('.main_content')?.scrollTo(0, 0));
      await page.waitForTimeout(500);
      for (const [i, name] of ['自动扫描情况跟踪', '下发新一轮次任务'].entries()) {
        const v = await page.getByRole('button', { name }).isVisible({ timeout: 3000 }).catch(() => false);
        tc.assertions.push(assert(`A-${i+1}`, `${name}按钮`, v, `visible=${v}`));
      }
      await screenshot(page, 'TC-005');
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-006: 跟踪弹框 ====================
    {
      const tc = { case_id: 'TC-006', title: '自动扫描情况跟踪弹框', assertions: [] };
      await page.getByRole('button', { name: '自动扫描情况跟踪' }).click();
      await page.waitForTimeout(2000);
      const checks = [
        ['A-1', '弹框标题', '.ant-modal-title >> text=自动扫描情况跟踪'],
        ['A-2', '数据表格', '.ant-modal .ant-table'],
        ['A-3', '月份筛选', '.ant-modal >> text=月份：'],
        ['A-4', '业务系统筛选', '.ant-modal >> text=业务系统：'],
        ['A-5', '状态筛选', '.ant-modal >> text=状态：'],
      ];
      for (const [id, desc, sel] of checks) {
        const v = await page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false);
        tc.assertions.push(assert(id, desc, v, `visible=${v}`));
      }
      await screenshot(page, 'TC-006');
      await page.locator('.ant-modal-close').first().click().catch(() => {});
      await page.waitForTimeout(500);
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-007: 手动下发弹框 ====================
    {
      const tc = { case_id: 'TC-007', title: '下发新一轮次任务弹框', assertions: [] };
      await page.getByRole('button', { name: '下发新一轮次任务' }).click();
      await page.waitForTimeout(2000);
      tc.assertions.push(assert('A-1', '弹框标题', await page.locator('.ant-modal-title').filter({ hasText: '下发新一轮次任务' }).isVisible({ timeout: 3000 }).catch(() => false), 'visible'));
      tc.assertions.push(assert('A-2', '定时开始时间', await page.locator('.ant-modal').getByText('定时开始时间').isVisible({ timeout: 3000 }).catch(() => false), 'visible'));
      for (const [i, name] of ['全部', '上次扫描失败资产', '本轮未扫描到的资产'].entries()) {
        const v = await page.locator('.ant-modal').getByRole('checkbox', { name }).isVisible({ timeout: 3000 }).catch(() => false);
        tc.assertions.push(assert(`A-${i+3}`, `${name}Checkbox`, v, `visible=${v}`));
      }
      await screenshot(page, 'TC-007');
      await page.locator('.ant-modal-close').first().click().catch(() => {});
      await page.waitForTimeout(500);
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-008: 外部漏洞特殊提示 ====================
    {
      const tc = { case_id: 'TC-008', title: '外部漏洞Tab特殊提示', assertions: [] };
      const alertBefore = await page.locator('text=外部漏洞扫描仅针对应用类型资产').isVisible({ timeout: 1000 }).catch(() => false);
      tc.assertions.push(assert('A-1', '基线Tab下无提示', !alertBefore, `visible=${alertBefore}`));
      await page.getByRole('tab', { name: '外部漏洞' }).click();
      await page.waitForTimeout(1500);
      const alertAfter = await page.locator('text=外部漏洞扫描仅针对应用类型资产').isVisible({ timeout: 3000 }).catch(() => false);
      tc.assertions.push(assert('A-2', '外部漏洞Tab下有提示', alertAfter, `visible=${alertAfter}`));
      await screenshot(page, 'TC-008');
      await page.getByRole('tab', { name: '基线检测' }).click();
      await page.waitForTimeout(1000);
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-009: 保存原始结果条件展示 ====================
    {
      const tc = { case_id: 'TC-009', title: '保存原始结果条件展示', assertions: [] };
      // 基线 - 有
      await page.getByRole('tab', { name: '基线检测' }).click();
      await page.waitForTimeout(1000);
      const el1 = page.locator('text=保存原始结果').first();
      await el1.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      tc.assertions.push(assert('A-1', '基线检测有保存原始结果', await el1.isVisible({ timeout: 3000 }).catch(() => false), 'visible'));
      // 弱口令 - 有
      await page.getByRole('tab', { name: '弱口令检测' }).click();
      await page.waitForTimeout(1000);
      const el2 = page.locator('text=保存原始结果').first();
      await el2.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      tc.assertions.push(assert('A-2', '弱口令检测有保存原始结果', await el2.isVisible({ timeout: 3000 }).catch(() => false), 'visible'));
      // 系统漏洞 - 无
      await page.getByRole('tab', { name: '系统漏洞' }).click();
      await page.waitForTimeout(1000);
      tc.assertions.push(assert('A-3', '系统漏洞无保存原始结果', (await page.locator('text=保存原始结果').count()) === 0, `count=${await page.locator('text=保存原始结果').count()}`));
      // 外部漏洞 - 无
      await page.getByRole('tab', { name: '外部漏洞' }).click();
      await page.waitForTimeout(1000);
      tc.assertions.push(assert('A-4', '外部漏洞无保存原始结果', (await page.locator('text=保存原始结果').count()) === 0, `count=${await page.locator('text=保存原始结果').count()}`));
      await screenshot(page, 'TC-009');
      await page.getByRole('tab', { name: '基线检测' }).click();
      await page.waitForTimeout(1000);
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-010: Checkbox互斥 ====================
    {
      const tc = { case_id: 'TC-010', title: '手动下发Checkbox互斥', assertions: [] };
      await page.evaluate(() => document.querySelector('.main_content')?.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: '下发新一轮次任务' }).click();
      await page.waitForTimeout(2000);
      const modal = page.locator('.ant-modal');
      // 默认全部选中
      tc.assertions.push(assert('A-1', '默认全部选中', await modal.getByRole('checkbox', { name: '全部' }).isChecked(), 'checked'));
      // 其他两项置灰
      tc.assertions.push(assert('A-2', '失败资产置灰', await modal.getByRole('checkbox', { name: '上次扫描失败资产' }).isDisabled(), 'disabled'));
      tc.assertions.push(assert('A-3', '未扫描资产置灰', await modal.getByRole('checkbox', { name: '本轮未扫描到的资产' }).isDisabled(), 'disabled'));
      // 取消全部
      await modal.getByRole('checkbox', { name: '全部' }).uncheck();
      await page.waitForTimeout(300);
      tc.assertions.push(assert('A-4', '取消后失败资产可选', !(await modal.getByRole('checkbox', { name: '上次扫描失败资产' }).isDisabled()), 'enabled'));
      tc.assertions.push(assert('A-5', '取消后未扫描资产可选', !(await modal.getByRole('checkbox', { name: '本轮未扫描到的资产' }).isDisabled()), 'enabled'));
      // 重新选全部
      await modal.getByRole('checkbox', { name: '全部' }).check();
      await page.waitForTimeout(300);
      tc.assertions.push(assert('A-6', '重选后再次置灰', await modal.getByRole('checkbox', { name: '上次扫描失败资产' }).isDisabled(), 'disabled'));
      await screenshot(page, 'TC-010');
      await page.locator('.ant-modal-close').first().click().catch(() => {});
      await page.waitForTimeout(500);
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

    // ==================== TC-011: 盲时表格操作 ====================
    {
      const tc = { case_id: 'TC-011', title: '盲时表格添加/切换/删除', assertions: [] };
      const addBtn = page.getByRole('button', { name: '添加盲时规则' });
      await addBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const rowsBefore = await page.locator('.blind-time-table .ant-table-tbody tr').count();
      await addBtn.click();
      await page.waitForTimeout(800);
      const rowsAfter = await page.locator('.blind-time-table .ant-table-tbody tr').count();
      tc.assertions.push(assert('A-1', '新增一行', rowsAfter > rowsBefore, `${rowsBefore}->${rowsAfter}`));
      // 默认类型整月
      const lastRow = page.locator('.blind-time-table .ant-table-tbody tr').last();
      const typeText = await lastRow.locator('.ant-select-selection-item').textContent().catch(() => '');
      tc.assertions.push(assert('A-2', '默认类型整月', typeText.includes('整月'), `type=${typeText}`));
      // 切换到时间段
      await lastRow.locator('.ant-select').click();
      await page.waitForTimeout(300);
      await page.locator('.ant-select-item-option').filter({ hasText: '时间段' }).click();
      await page.waitForTimeout(500);
      const timePickers = await lastRow.locator('.ant-picker').count();
      tc.assertions.push(assert('A-3', '时间段显示时间选择器', timePickers >= 2, `pickers=${timePickers}`));
      await screenshot(page, 'TC-011');
      // 删除
      await lastRow.locator('.delete-btn, .anticon-delete').first().click();
      await page.waitForTimeout(300);
      const popConfirm = page.locator('.ant-popover .ant-btn-primary, .ant-popconfirm-buttons .ant-btn-primary').first();
      if (await popConfirm.isVisible({ timeout: 2000 }).catch(() => false)) await popConfirm.click();
      await page.waitForTimeout(500);
      const rowsFinal = await page.locator('.blind-time-table .ant-table-tbody tr').count();
      tc.assertions.push(assert('A-4', '删除后恢复', rowsFinal <= rowsBefore, `rows=${rowsFinal}`));
      tc.status = tc.assertions.every(a => a.verdict === 'pass') ? 'passed' : 'failed';
      results.push(tc);
    }

  } catch (err) {
    results.push({ case_id: 'FATAL', title: 'Uncaught error', status: 'error', error: err.message });
    await screenshot(page, 'FATAL-error').catch(() => {});
  }

  // ==================== 输出结果 ====================
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalAssertions = results.reduce((s, tc) => s + (tc.assertions?.length || 0), 0);
  const passedAssertions = results.reduce((s, tc) => s + (tc.assertions?.filter(a => a.verdict === 'pass').length || 0), 0);

  const output = {
    run_id: 'script-verify-001',
    executed_at: new Date().toISOString(),
    elapsed_seconds: parseFloat(elapsed),
    environment: { target: CONFIG.baseUrl, browser: 'chromium', viewport: '1920x1080' },
    summary: {
      total_cases: results.length,
      passed_cases: results.filter(tc => tc.status === 'passed').length,
      failed_cases: results.filter(tc => tc.status === 'failed').length,
      total_assertions: totalAssertions,
      passed_assertions: passedAssertions,
    },
    test_cases: results,
  };

  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output.summary, null, 2));
  console.log(`\nDone in ${elapsed}s. Results: ${CONFIG.outputFile}`);

  await browser.close();
})();

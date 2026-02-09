# 手工验证经验总结（Step 1 + Step 2）

## 文档信息

| 项目 | 内容 |
|------|------|
| 验证日期 | 2026-02-09 |
| 验证目标 | 验证 PRD + 前端源码 → Playwright 测试用例生成 → UI 自动化执行 的可行性 |
| 被测页面 | 任务自动下发配置（/autoscan） |
| 目标服务 | https://localhost:8089/ |
| 技术栈 | React + Ant Design 4.x，hash routing |

---

## 1. 验证结论

**源码辅助生成方案可行。** 通过 PRD + 前端源码（路由表 + 页面组件），AI 能够生成准确的 Playwright 选择器和测试步骤。10 个用例、37 条断言全部通过。

但过程中暴露了多个需要在系统设计中提前处理的问题，否则自动化执行时会频繁失败。

---

## 2. 踩坑记录

### 2.1 HTTPS 自签名证书

**现象：**
- `page.goto('https://localhost:8089/')` 报 `ERR_CERT_AUTHORITY_INVALID`
- 改用 HTTP 报 `ERR_EMPTY_RESPONSE`（服务只接受 HTTPS）

**原因：** 目标服务使用自签名证书，Playwright 默认拒绝不受信任的证书。

**解决方案：** 创建新的 browser context 并设置 `ignoreHTTPSErrors: true`：

```javascript
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1920, height: 1080 },
  locale: 'zh-CN'
});
const page = await context.newPage();
```

**连锁影响：** 新 context 中的 page 与 MCP Playwright 工具管理的默认 page 分离，后续所有操作只能通过 `browser_run_code` 执行，无法使用 `browser_click`、`browser_snapshot` 等便捷工具。

**系统设计建议：** target profile 中增加 `ignoreHTTPSErrors` 配置项：

```json
{
  "browser": {
    "ignoreHTTPSErrors": true
  }
}
```

---

### 2.2 Ant Design 按钮文本自动插入空格

**现象：**
- `getByRole('button', { name: '关闭' })` 找不到元素，`isVisible` 返回 false
- 实际 DOM 中按钮文本是 `"关 闭"`（两个汉字之间有空格）

**原因：** Ant Design 的 Button 组件会在**两个相邻汉字之间自动插入空格**（CSS `::after` 或 JS 处理），这是 Ant Design 的设计规范。受影响的按钮包括：

| 源码文本 | 实际渲染文本 |
|---------|------------|
| 登录 | 登 录 |
| 关闭 | 关 闭 |
| 确认 | 确 认 |
| 取消 | 取 消 |
| 提交 | 提 交 |

**解决方案：** 使用正则表达式匹配：

```javascript
// 错误 ❌
getByRole('button', { name: '关闭' })

// 正确 ✅
getByRole('button', { name: /关.*闭/ })
locator('.ant-modal-footer').getByRole('button', { name: /确.*认/ })
```

**系统设计建议：** 在选择器策略文档中增加 Ant Design 专项规则：
- 所有两字汉字按钮一律使用正则匹配：`/X.*Y/`
- 或者使用 `locator('button:has-text("关闭")')` （Playwright 的 `has-text` 会做子串匹配，能容忍空格）
- 三字及以上按钮（如"保存配置"、"添加盲时规则"）不受影响，可直接用精确文本

---

### 2.3 登录页多套表单（同 ID 元素冲突）

**现象：**
- `#username` 在页面上出现 3 次，`#tenant` 出现 3 次
- `locator('#username').fill('admin')` 可能填到错误的表单中

**原因：** 登录页有多个 Tab（密码登录、短信登录、邮箱登录），每个 Tab 各有一套完整的表单，且使用相同的 `id`。

**各 Tab 的区分特征：**

| Tab | 用户名 placeholder | 密码字段 | 验证码字段 |
|-----|-------------------|---------|-----------|
| 密码登录 | 请输入用户名 | 请输入密码 | 无 |
| 短信登录 | 输入用户名 | 无 | 请输入短信验证码 |
| 邮箱登录 | 输入用户名 | 无 | 请输入邮箱验证码 |

**解决方案：** 用 `placeholder` 精确定位：

```javascript
// 错误 ❌ — 可能匹配到非当前 Tab 的 input
locator('#username').fill('admin')

// 正确 ✅ — 通过 placeholder 区分
locator('input[placeholder="请输入用户名"]').first().fill('admin')
locator('input[placeholder="请输入密码"]').first().fill('password')
```

**系统设计建议：** target profile 的 login 配置需要支持更精确的定位策略：

```json
{
  "login": {
    "username_selector": "input[placeholder='请输入用户名']",
    "password_selector": "input[placeholder='请输入密码']",
    "submit_selector": "button:has-text('登录')"
  }
}
```

---

### 2.4 租户选择器操作失败（Ant Design Select）

**现象：**
- 尝试点击 `#tenant` 的父元素展开下拉框
- 报错：`<span title="pg" class="ant-select-selection-item">pg</span> intercepts pointer events`
- 超时 30 秒后失败

**原因：** 两个问题叠加：
1. 租户已经默认选中了 "pg"，根本不需要操作
2. Ant Design Select 不是原生 `<select>`，点击展开需要精确定位到 `.ant-select-selector`，而不是内部的 `<input type="search">`

**解决方案：**
1. **操作前先检查当前值**，已是目标值则跳过
2. 如果确实需要操作 Ant Design Select：

```javascript
// 正确的操作流程
await page.locator('.ant-select-selector').click();  // 展开下拉
await page.waitForTimeout(300);
await page.locator('.ant-select-item-option').filter({ hasText: 'pg' }).click();  // 选择选项
```

**系统设计建议：**
- 登录流程增加"前置检查"步骤：读取当前表单值，已是目标值则跳过
- Ant Design Select 的操作封装为通用 helper，避免每次都踩坑

---

### 2.5 路由路径与菜单 key 不一致

**现象：**
- routes.js 中的 key 是 `AUTO_SCAN_CONFIG`
- 尝试 `#/AUTO_SCAN_CONFIG` 导航，页面停留在 dashboard，组件未加载
- 实际可用路径是 `#/autoscan`

**原因：** 该框架的路由机制是：菜单配置中的 `path` 决定 URL hash，routes.js 中的 `key` 只是组件映射标识，两者不一定一致。

**解决方案：** 不能从 routes.js 推断 URL，需要从菜单配置或实际页面中获取真实路径。

**系统设计建议：**
- 源码索引器解析路由时，需要同时解析菜单配置文件（menu.js），获取真实的 URL path
- target profile 中 `allowed_routes` 应填写实际 URL path（如 `/autoscan`），而非组件 key

---

### 2.6 弹框未关闭导致后续操作阻塞

**现象：**
- REQ-010 测试完"自动扫描情况跟踪"弹框后，尝试用 `getByRole('button', { name: '关闭' })` 关闭
- 因 2.2 的空格问题关闭失败，弹框仍然打开
- REQ-011 点击"下发新一轮次任务"按钮时，按钮被弹框遮挡，超时 30 秒

**原因：** 前一个测试用例的清理（teardown）失败，影响了后续用例。

**解决方案：**
1. 每个涉及弹框的用例，在开始前先检查并关闭已有弹框
2. 关闭弹框优先使用 X 按钮（`aria-label="Close"`），比 footer 按钮更可靠：

```javascript
// 通用弹框关闭 — 优先用 X 按钮
try {
  await page.locator('.ant-modal-close').first().click({ timeout: 2000 });
  await page.waitForTimeout(500);
} catch(e) { /* 无弹框则忽略 */ }
```

**系统设计建议：**
- 每个测试用例执行前增加"环境清理"步骤：关闭所有已打开的 Modal
- 用例之间保持页面状态独立，避免级联失败

---

## 3. 选择器策略修订建议

基于本次验证，对设计文档中的选择器优先级策略补充 Ant Design 专项规则：

```
Ant Design 项目选择器注意事项：

1. 两字汉字按钮 → 使用正则：/关.*闭/、/确.*认/、/取.*消/
2. 三字及以上按钮 → 可直接用文本：'保存配置'、'添加盲时规则'
3. Ant Design Select → 不能用原生 select 方式操作，需点击 .ant-select-selector 展开
4. 弹框关闭 → 优先用 .ant-modal-close (X按钮)，aria-label="Close"
5. 多 Tab 页面 → 同 id 元素可能存在多个，用 placeholder/可见性/父容器区分
6. TreeSelect → treeCheckStrictly 模式下值为 {value, label} 对象，非纯 ID
```

---

## 4. target profile 修订建议

```json
{
  "target_profile": {
    "base_url": "https://localhost:8089",
    "browser": {
      "ignoreHTTPSErrors": true,
      "viewport": { "width": 1920, "height": 1080 },
      "locale": "zh-CN"
    },
    "login": {
      "login_url": "/#/login",
      "tenant_value": "pg",
      "tenant_already_selected": true,
      "username_selector": "input[placeholder='请输入用户名']",
      "password_selector": "input[placeholder='请输入密码']",
      "submit_selector": "button:has-text('登录')",
      "credentials": { "username": "$TEST_USERNAME", "password": "$TEST_PASSWORD" },
      "success_indicator": "/#/myWorkSatp"
    },
    "ui_framework": "antd",
    "antd_quirks": {
      "button_text_space": true,
      "select_type": "custom",
      "modal_close_selector": ".ant-modal-close"
    }
  }
}
```

---

## 5. 验证产出物

```
.ai-test-workspace/manual-verify-001/
├── requirements.json              ← 12 条需求（从 PRD 解析）
├── test-cases.json                ← 10 个测试用例（含 Playwright 步骤和选择器）
├── execution-results.json         ← 执行结果（37 条断言，100% pass）
└── evidence/screenshots/          ← 每步截图
    ├── login-page.png
    ├── login-filled.png
    ├── after-login.png
    ├── autoscan-page.png
    ├── REQ-001-TC-001.png
    ├── REQ-001-TC-002.png
    ├── REQ-002-TC-001.png
    ├── REQ-003-TC-001.png
    ├── REQ-004-TC-001.png
    ├── REQ-005-TC-001.png
    ├── REQ-006-TC-001.png
    ├── REQ-009-TC-001.png
    ├── REQ-010-TC-001-retry.png
    └── REQ-011-TC-001-retry.png
```

---

## 6. Step 2: Codex 审核能力验证

### 6.1 验证目标

验证 Codex（gpt-5.3-codex）能否作为交叉审核 agent，通过截图证据审核 Claude Code 的测试执行结果。

### 6.2 验证方法

| 轮次 | 输入 | 预期 |
|------|------|------|
| 第一轮（正常 case） | 全 pass 的执行结果 + 10 张截图 | Codex 应输出 agree |
| 第二轮（篡改 case） | 6 条 pass→fail 篡改 + 对应截图 | Codex 应识别出 disagree |

### 6.3 Codex 调用方式

```bash
codex exec \
  --skip-git-repo-check \
  -s read-only \
  -i screenshots/*.png \
  --output-schema codex-review-schema.json \
  -o codex-review-result.json \
  "$(cat review-prompt.md)"
```

关键参数：
- `exec`：非交互模式
- `-s read-only`：只读沙箱，Codex 不需要执行任何命令
- `-i`：传入截图（支持多张）
- `--output-schema`：强制 JSON Schema 输出格式
- `-o`：结果输出到文件

### 6.4 Schema 踩坑

OpenAI Structured Output 对 JSON Schema 有严格要求：

1. **必须有 `additionalProperties: false`**：每个 `type: "object"` 都必须显式声明
2. **`required` 必须包含所有 properties 中的 key**：不能只列部分字段，即使某些字段是 nullable

```json
{
  "type": "object",
  "required": ["subject_id", "conflict_type", "reasoning", "suggestions"],
  "additionalProperties": false,
  "properties": {
    "conflict_type": { "type": ["string", "null"], "enum": ["fact_conflict", null] },
    "suggestions": { "type": ["string", "null"] }
  }
}
```

### 6.5 第一轮结果：正常 case（全 pass）

| 指标 | 数值 |
|------|------|
| 审核断言数 | 40（Codex 多计了 3 条，实际 37 条） |
| agree | 34 (85%) |
| disagree | 0 (0%) |
| uncertain | 6 (15%) |

**6 条 uncertain 的原因分析：**

| 断言 | Codex 判定 | 原因 |
|------|-----------|------|
| REQ-001-TC-002/A-001 | uncertain | "无法从静态截图验证 aria-selected=true 属性值" |
| REQ-005-TC-001/A-005 | uncertain | "截图未清晰显示'选择业务系统范围'标签" |
| REQ-006-TC-001/A-001~A-003 | uncertain (3条) | "截图中未见'自动下发模式'区块" — 因为该区域在页面下方需要滚动 |
| REQ-009-TC-001/A-003 | uncertain | "截图未显示'保存配置'按钮" — 同样因为在页面底部 |

**关键发现：**
- Codex 对截图中**可见的元素**判断准确率 100%（34/34 agree）
- Codex 对截图中**不可见的元素**（需要滚动才能看到）正确给出 uncertain 而非盲目 agree
- Codex 对 DOM 属性（aria-selected）正确识别为无法从截图验证

### 6.6 第二轮结果：篡改 case（6 条 fail 篡改）

| 指标 | 数值 |
|------|------|
| 审核断言数 | 19 |
| agree | 11 |
| disagree | 6 (100% 命中篡改) |
| uncertain | 2 |

**篡改识别结果：**

| 篡改断言 | Codex 判定 | conflict_type | reasoning |
|---------|-----------|---------------|-----------|
| A-002: 弱口令检测Tab不存在 | **disagree** | fact_conflict | "截图中可见'弱口令检测'Tab文本，原判定与证据矛盾" |
| A-004: 外部漏洞Tab不存在 | **disagree** | fact_conflict | "截图中可见'外部漏洞'Tab，原判定与截图不符" |
| A-002: 页面上没有Switch | **disagree** | fact_conflict | "'是否开启'右侧可见开关控件，并非不存在" |
| A-003: 弹框没有关闭按钮 | **disagree** | fact_conflict | "弹框右上角有关闭X，底部还有关闭按钮" |
| A-004: 弹框内没有表格 | **disagree** | fact_conflict | "弹框中可见完整表头与多行数据，非空白区域" |
| A-001: 弹框标题为'新建任务' | **disagree** | fact_conflict | "弹框标题清晰为'下发新一轮次任务'，并非'新建任务'" |

**6/6 篡改全部被识别，0 漏检。**

### 6.7 验证结论

**Codex 交叉审核方案可行。** 具体结论：

1. **事实判断能力强**：对截图中可见元素的存在性判断准确率 100%
2. **篡改检测能力强**：6/6 篡改全部识别，0 漏检，且能准确说明矛盾原因
3. **边界意识好**：对截图外（需滚动）的元素给出 uncertain 而非盲目 agree；对 DOM 属性（非视觉）也给出 uncertain
4. **结构化输出可靠**：严格遵循 JSON Schema，conflict_type 分类准确

**需要改进的点：**

1. **截图覆盖不足**：当前截图只截取了 viewport 可见区域，页面底部的元素（自动下发模式、保存配置按钮）未被截图覆盖，导致 6 条 uncertain。**建议：对长页面使用 `fullPage: true` 截图，或分段截图**
2. **DOM 属性无法从截图验证**：aria-selected 等属性需要额外的 DOM snapshot 作为证据，不能只靠截图
3. **token 消耗**：第一轮 23,579 tokens，第二轮 14,106 tokens。10 张截图 + 37 条断言约 24K tokens，成本可控

### 6.8 产出文件

```
.ai-test-workspace/manual-verify-001/
├── review-prompt-normal.md        ← 正常 case 审核 prompt
├── review-prompt-tampered.md      ← 篡改 case 审核 prompt
├── codex-review-schema.json       ← Codex 输出 JSON Schema
├── codex-review-normal.json       ← 第一轮审核结果（34 agree / 6 uncertain）
└── codex-review-tampered.json     ← 第二轮审核结果（6 disagree 全部命中）
```

---

## 7. Step 3: 复杂交互场景验证

### 7.1 验证目标

Step 1/2 的测试用例全部是"元素可见性"断言，Step 3 验证 AI 能否生成和执行更复杂的交互测试：条件展示、Checkbox 互斥、表格动态操作、开关确认弹框等。

### 7.2 测试结果

| 用例ID | 标题 | 断言数 | 结果 |
|--------|------|--------|------|
| INTERACT-001 | 外部漏洞Tab展示特殊提示 | 2 | PASS |
| INTERACT-002 | 保存原始结果Checkbox条件展示 | 4 | PASS（修复滚动后） |
| INTERACT-003 | 手动下发弹框Checkbox互斥规则 | 6 | PASS |
| INTERACT-004 | 盲时表格添加规则及类型切换 | 6 | PASS |
| INTERACT-005 | 开关关闭二次确认弹框 | 2 | SKIPPED（开关已被误操作关闭） |

**总计：20 条断言，19 pass，1 skipped。**

### 7.3 踩坑记录

#### 7.3.1 滚动容器定位错误

**现象：** `INTERACT-002` 首次执行时，"保存原始结果"在基线检测和弱口令Tab下均 `isVisible=false`，但元素确实存在于 DOM 中（top=1573px）。

**原因：** 尝试对 `.auto-scan-config` 调用 `scrollTo(0, scrollHeight)` 无效。该元素不是实际的滚动容器，真正的滚动容器是外层的 `.main_content` → `.ka-content` → `.ant-tabs-content-holder` 等多层嵌套。

**解决方案：** 不要猜测滚动容器，直接用 Playwright 的 `scrollIntoViewIfNeeded()`：

```javascript
// 错误 ❌ — 猜测滚动容器
await page.locator('.auto-scan-config').evaluate(el => el.scrollTo(0, el.scrollHeight));

// 正确 ✅ — 让 Playwright 自动处理
await page.locator('text=保存原始结果').first().scrollIntoViewIfNeeded();
```

**系统设计建议：**
- 所有断言执行前，先对目标元素调用 `scrollIntoViewIfNeeded()`
- 对"元素不存在"的断言，使用 `.count() === 0` 而非 `isVisible() === false`（后者可能因为元素在视口外而误判）

#### 7.3.2 Ant Design Switch 的 aria-checked 值不一致

**现象：** `INTERACT-005` 首次执行时，`aria-checked` 返回 `"1"` 而非 `"true"`。代码用 `=== 'true'` 判断，误认为开关是关闭状态，直接点击导致开关从 ON 变为 OFF（绕过了确认弹框逻辑）。

**原因：** Ant Design Switch 在不同版本/配置下，`aria-checked` 可能返回 `"true"/"false"` 或 `"1"/"0"` 或 `1/0`。

**解决方案：** 不依赖 `aria-checked`，改用 CSS class 判断：

```javascript
// 不可靠 ❌
const isOn = await switchEl.getAttribute('aria-checked') === 'true';

// 可靠 ✅
const isOn = await switchEl.evaluate(el => el.classList.contains('ant-switch-checked'));
```

**系统设计建议：** 在 Ant Design 选择器策略中增加：
- Switch 状态判断用 `.ant-switch-checked` class，不用 `aria-checked`

#### 7.3.3 测试用例的状态依赖问题

**现象：** `INTERACT-005` 的开关确认弹框测试被跳过，因为前一次误操作已经把开关从 ON 切到了 OFF。

**教训：** 交互测试会改变页面状态，后续用例依赖前序状态。如果前序用例出错（如 7.3.2 的 aria-checked 误判），会导致后续用例无法执行。

**系统设计建议：**
- 每个交互测试用例开始前，记录关键状态（开关、选中项等）
- 用例结束后恢复到初始状态（teardown）
- 对有副作用的操作（开关切换、数据修改），在 precondition 中明确要求的初始状态

### 7.4 验证结论

**复杂交互场景 AI 生成可行，但需要额外的策���支撑。** 具体结论：

| 能力 | 验证结果 | 说明 |
|------|---------|------|
| Tab 切换联动 | ✅ 可行 | 条件展示（Alert、Checkbox）随 Tab 切换正确变化 |
| Checkbox 互斥 | ✅ 可行 | check/uncheck + disabled 状态判断准确 |
| 表格动态操作 | ✅ 可行 | 添加行、切换类型、验证输入组件变化、删除行，全链路通过 |
| 滚动到视口外元素 | ⚠️ 需策略 | 必须用 `scrollIntoViewIfNeeded`，不能猜测滚动容器 |
| 组件状态判断 | ⚠️ 需策略 | Switch 用 class 判断，不用 aria-checked |
| 有副作用的操作 | ⚠️ 需策略 | 需要 precondition 检查 + teardown 恢复 |

### 7.5 三步验证总结

| 步骤 | 验证内容 | 结论 |
|------|---------|------|
| Step 1 | PRD+源码 → 用例生成 → Playwright 执行 | ✅ 可行（37 断言 100% pass） |
| Step 2 | Codex 交叉审核 | ✅ 可行（篡改检测 6/6 命中） |
| Step 3 | 复杂交互场景 | ✅ 可行（20 断言 19 pass / 1 skipped） |
| Step 4 | 执行方式对比（MCP vs 脚本） | ✅ 脚本方式全面优于 MCP 逐步调用 |

**整体结论：PRD-Based UI Testing Agent 的核心链路已验证通过，可以进入工程化阶段。**

需要在工程化中落地的策略清单：

1. 截图策略：长页面用 `fullPage: true` 或分段截图
2. 滚动策略：统一用 `scrollIntoViewIfNeeded`
3. Ant Design 适配：按钮正则、Switch 用 class、Select 用自定义操作
4. 状态管理：precondition 检查 + teardown 恢复
5. 断言策略："不存在"用 `count()===0`，"存在"先 scroll 再 `isVisible()`
6. Codex Schema：`additionalProperties: false` + `required` 包含所有 key
7. HTTPS：target profile 配置 `ignoreHTTPSErrors`
8. 登录：支持多表单页面精确定位
9. **执行方式：生成完整 JS 测试脚本 + `node test.js` 直接执行，Playwright MCP 仅用于探索/调试**

---

## 8. Step 4: 执行方式对比验证

### 8.1 验证背景

Step 1-3 的测试执行均通过 Playwright MCP 工具逐步调用完成（`browser_click`、`browser_snapshot`、`browser_run_code` 等）。在 Step 1 的基础上，尝试将相同的测试用例改为生成完整的 JS 测试脚本后直接用 `node test.js` 一次性执行，对比两种方式的效率和效果。

### 8.2 对比结果

| 维度 | Playwright MCP（逐步调用） | JS 脚本直接执行 |
|------|--------------------------|----------------|
| 耗时 | ~15 分钟（多轮对话） | 30 秒 |
| 工具调用次数 | ~20 次 | 1 次（`node test.js`） |
| Token 消耗 | 大量（每次调用带上下文） | 极少（只有生成 + 读结果） |
| 断言覆盖 | 37 条断言 pass | 46 条断言 pass（覆盖更多） |
| 截图 | 手动拼装 | 脚本自动输出 |
| 可复现性 | 需要重新对话 | 直接 `node test.js` |

### 8.3 分析

**Playwright MCP 逐步调用的问题：**

1. **效率低**：每个操作（点击、截图、断言）都是一次工具调用，需要 AI 解析返回结果后决定下一步，多轮对话开销巨大
2. **Token 浪费**：每次工具调用都携带完整上下文（页面快照、历史操作），Token 消耗随步骤数线性增长
3. **不可复现**：测试过程嵌入在对话中，无法脱离 AI 独立重跑
4. **覆盖受限**：受对话轮次和上下文窗口限制，难以在单次对话中覆盖所有用例

**JS 脚本直接执行的优势：**

1. **效率高**：一次生成、一次执行，30 秒完成全部 11 个用例 46 条断言
2. **Token 极少**：AI 只需生成脚本 + 读取执行结果，中间执行过程零 Token 消耗
3. **天然可复现**：脚本文件可版本管理、可重复执行、可集成到 CI/CD
4. **覆盖更全**：不受对话轮次限制，可以在单个脚本中覆盖所有用例

### 8.4 Playwright MCP 的正确定位

Playwright MCP 并非无用，而是应该用在正确的场景：

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| **探索页面结构** | Playwright MCP | 交互式探索，快速了解页面元素和布局 |
| **调试选择器** | Playwright MCP | 逐步验证选择器是否正确，即时反馈 |
| **正式执行测试** | JS 脚本直接执行 | 效率高、可复现、覆盖全 |
| **CI/CD 集成** | JS 脚本直接执行 | 脚本可独立运行，不依赖 AI 对话 |
| **回归测试** | JS 脚本直接执行 | 同一脚本反复执行，零额外成本 |

### 8.5 验证结论

**生成 JS 脚本 + 直接执行是正确的正式执行方案。** Playwright MCP 适合探索和调试阶段，但正式测试执行必须用生成的脚本。

这一发现对系统设计的影响：
- Step 2（执行 UI 测试）的架构需要调整：Claude Code 的职责从"通过 MCP 逐步执行"变为"生成完整测试脚本 + 调用 `node` 执行"
- 执行层从"AI 驱动的多轮交互"变为"AI 生成 + 程序执行"，大幅降低 Token 消耗和执行时间
- 脚本产物可纳入版本管理，支持独立重跑和 CI/CD 集成

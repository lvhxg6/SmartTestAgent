# 需求文档：测试用例审批流程优化

## 简介

本功能优化测试用例生成后的审批流程，解决当前存在的以下问题：
1. 生成用例后，等待审批状态被直接跳过
2. 审批页面没有展示测试用例内容
3. 审批页面没有通过/拒绝按钮
4. 审批拒绝后无法基于反馈重新生成
5. 无法预览和下载 Playwright 脚本

## 术语表

- **TestCase（测试用例）**：从 PRD 解析生成的测试用例，包含步骤、断言等信息
- **Requirement（需求）**：从 PRD 提取的结构化需求
- **Approval（审批）**：用户对生成的测试用例进行审核确认的过程
- **Playwright Script（Playwright 脚本）**：基于测试用例生成的自动化测试脚本
- **Regeneration（重新生成）**：基于用户反馈重新生成测试用例的过程

## 需求

### 需求 1：修复审批状态流转

**用户故事：** 作为用户，我希望在测试用例生成完成后，系统能够正确进入等待审批状态，以便我有机会审核测试用例。

#### 验收标准

1. WHEN PRD 解析步骤完成并生成测试用例 THEN 系统 SHALL 将状态更新为 `awaiting_approval`
2. WHEN 状态为 `awaiting_approval` THEN 系统 SHALL 暂停 Pipeline 执行，等待用户审批
3. WHEN 用户批准测试用例 THEN 系统 SHALL 继续执行后续步骤（test_execution）
4. WHEN 用户拒绝测试用例 THEN 系统 SHALL 进入重新生成流程
5. THE 状态转换 SHALL 通过 WebSocket 实时通知前端

### 需求 2：测试用例展示

**用户故事：** 作为用户，我希望在审批页面能够查看生成的测试用例详情，以便做出准确的审批决策。

#### 验收标准

1. WHEN 状态为 `awaiting_approval` THEN 系统 SHALL 在页面展示所有生成的测试用例
2. THE 测试用例展示 SHALL 包含以下信息：
   - 用例 ID（case_id）
   - 关联需求 ID（requirement_id）
   - 用例标题（title）
   - 前置条件（precondition）
   - 测试步骤（steps）
   - 断言（assertions）
   - 标签（tags）
3. WHEN 测试用例数量较多 THEN 系统 SHALL 支持按需求分组展示
4. WHEN 用户点击某个测试用例 THEN 系统 SHALL 展开显示详细信息
5. THE 展示界面 SHALL 支持搜索和筛选功能

### 需求 3：需求展示

**用户故事：** 作为用户，我希望在审批页面能够查看解析出的需求列表，以便对照 PRD 验证需求提取的准确性。

#### 验收标准

1. WHEN 状态为 `awaiting_approval` THEN 系统 SHALL 在页面展示所有解析出的需求
2. THE 需求展示 SHALL 包含以下信息：
   - 需求 ID（requirement_id）
   - 标题（title）
   - 描述（description）
   - 优先级（priority）
   - 验收标准（acceptance_criteria）
   - 关联路由（route）
3. WHEN 用户点击某个需求 THEN 系统 SHALL 显示该需求关联的所有测试用例
4. THE 需求列表 SHALL 按优先级排序（P0 > P1 > P2）

### 需求 4：审批操作

**用户故事：** 作为用户，我希望能够方便地批准或拒绝测试用例，并提供反馈意见。

#### 验收标准

1. WHEN 状态为 `awaiting_approval` THEN 系统 SHALL 显示"批准"和"拒绝"按钮
2. WHEN 用户点击"批准"按钮 THEN 系统 SHALL 弹出确认对话框，允许填写审批意见
3. WHEN 用户点击"拒绝"按钮 THEN 系统 SHALL 弹出反馈对话框，要求填写拒绝原因
4. THE 拒绝反馈 SHALL 支持以下类型：
   - 测试用例覆盖不全
   - 测试步骤不正确
   - 断言不准确
   - 其他（自定义描述）
5. WHEN 用户提交审批决策 THEN 系统 SHALL 记录审批人、时间、意见到 decision_log

### 需求 5：基于反馈重新生成

**用户故事：** 作为用户，我希望在拒绝测试用例后，系统能够基于我的反馈重新生成更准确的测试用例。

#### 验收标准

1. WHEN 用户拒绝测试用例并提供反馈 THEN 系统 SHALL 将反馈信息传递给 AI 重新生成
2. THE 重新生成 SHALL 基于以下输入：
   - 原始 PRD 文档
   - 已生成的测试用例（作为参考）
   - 用户反馈意见
3. WHEN 重新生成完成 THEN 系统 SHALL 再次进入 `awaiting_approval` 状态
4. THE 系统 SHALL 限制最大重新生成次数为 3 次
5. WHEN 达到最大重新生成次数 THEN 系统 SHALL 提示用户手动编辑或强制继续

### 需求 6：Playwright 脚本预览

**用户故事：** 作为用户，我希望能够预览将要执行的 Playwright 脚本，以便了解测试的具体执行逻辑。

#### 验收标准

1. WHEN 用户在审批页面点击"预览脚本"按钮 THEN 系统 SHALL 生成并展示 Playwright 脚本
2. THE 脚本预览 SHALL 支持语法高亮显示
3. THE 脚本预览 SHALL 支持按测试用例分段展示
4. WHEN 用户修改测试用例后 THEN 系统 SHALL 能够重新生成对应的脚本预览
5. THE 脚本生成 SHALL 使用与实际执行相同的模板和逻辑

### 需求 7：Playwright 脚本下载

**用户故事：** 作为用户，我希望能够下载生成的 Playwright 脚本，以便在本地调试或手动执行。

#### 验收标准

1. WHEN 用户点击"下载脚本"按钮 THEN 系统 SHALL 生成完整的 Playwright 测试脚本文件
2. THE 下载文件 SHALL 为 `.js` 格式，可直接使用 Node.js 执行
3. THE 下载文件 SHALL 包含所有必要的配置和依赖说明
4. WHEN 下载多个测试用例的脚本 THEN 系统 SHALL 支持打包为 `.zip` 文件
5. THE 下载的脚本 SHALL 包含注释说明测试用例来源和生成时间

### 需求 8：API 支持

**用户故事：** 作为开发者，我需要后端 API 支持测试用例和需求的查询、脚本生成等功能。

#### 验收标准

1. THE 系统 SHALL 提供 `getTestCases` API 返回指定 runId 的测试用例列表
2. THE 系统 SHALL 提供 `getRequirements` API 返回指定 runId 的需求列表
3. THE 系统 SHALL 提供 `generateScript` API 生成指定测试用例的 Playwright 脚本
4. THE 系统 SHALL 提供 `downloadScript` API 下载 Playwright 脚本文件
5. THE 系统 SHALL 提供 `regenerateTestCases` API 基于反馈重新生成测试用例
6. ALL API SHALL 返回适当的错误码和错误信息


# 需求文档

## 简介

本功能实现 Pipeline 流程的"断点续跑"能力，允许用户从指定步骤恢复执行测试流程。当测试流程因某些原因中断或失败时，用户可以复用之前已完成步骤的输出结果，从指定步骤继续执行，避免重复执行耗时的前置步骤。

## 术语表

- **Pipeline**：测试执行流水线，包含多个顺序执行的步骤
- **Step（步骤）**：Pipeline 中的单个执行单元，如 PRD 解析、测试执行等
- **TestRun**：一次测试运行的实例，包含运行状态和输出文件
- **Workspace（工作目录）**：存储测试运行输入输出文件的目录，路径为 `.ai-test-workspace/{runId}/`
- **Resume（恢复执行）**：从指定步骤开始继续执行 Pipeline，复用之前步骤的输出
- **Prerequisite_Files（前置文件）**：某个步骤执行所需的前置步骤输出文件

## 需求

### 需求 1：恢复执行 API

**用户故事：** 作为开发者，我希望能够通过 API 从指定步骤恢复执行测试流程，以便在流程中断后无需从头开始。

#### 验收标准

1. WHEN 用户调用 resumeRun API 并提供有效的 runId 和 fromStep 参数 THEN 系统 SHALL 从指定步骤开始执行 Pipeline
2. WHEN 用户指定的 fromStep 所需的前置文件不存在 THEN 系统 SHALL 返回错误信息，说明缺少哪些前置文件
3. WHEN 用户指定的 runId 对应的 TestRun 不存在 THEN 系统 SHALL 返回 "TestRun not found" 错误
4. WHEN 用户指定的 fromStep 不是有效的步骤名称 THEN 系统 SHALL 返回 "Invalid step name" 错误
5. WHEN TestRun 当前状态为 executing 或 codex_reviewing THEN 系统 SHALL 返回 "TestRun is already running" 错误，阻止重复执行
6. THE resumeRun API SHALL 接受以下参数：runId（字符串）、fromStep（枚举类型，可选值为 prd_parsing、test_execution、codex_review、cross_validation、report_generation、quality_gate）

### 需求 2：前置文件验证

**用户故事：** 作为开发者，我希望系统能够自动验证恢复执行所需的前置文件是否存在，以便确保恢复执行能够成功。

#### 验收标准

1. WHEN 系统验证 test_execution 步骤的前置条件 THEN 系统 SHALL 检查 requirements.json 和 test-cases.json（或 test-cases/ 目录）是否存在
2. WHEN 系统验证 codex_review 步骤的前置条件 THEN 系统 SHALL 检查 execution-results.json 是否存在
3. WHEN 系统验证 cross_validation 步骤的前置条件 THEN 系统 SHALL 检查 codex-review-results.json 是否存在
4. WHEN 系统验证 report_generation 步骤的前置条件 THEN 系统 SHALL 检查 cross-validation-results.json 是否存在
5. WHEN 系统验证 quality_gate 步骤的前置条件 THEN 系统 SHALL 检查 report.html 是否存在
6. WHEN 系统验证 prd_parsing 步骤的前置条件 THEN 系统 SHALL 检查 inputs/prd.md 是否存在
7. THE 验证结果 SHALL 返回一个对象，包含 valid（布尔值）和 missingFiles（字符串数组）字段

### 需求 3：可恢复步骤查询

**用户故事：** 作为开发者，我希望能够查询某个 TestRun 可以从哪些步骤恢复执行，以便选择合适的恢复点。

#### 验收标准

1. WHEN 用户调用 getResumableSteps API 并提供有效的 runId THEN 系统 SHALL 返回该 TestRun 可恢复的步骤列表
2. WHEN 工作目录中存在 requirements.json 和 test-cases.json THEN 系统 SHALL 在可恢复步骤列表中包含 test_execution
3. WHEN 工作目录中存在 execution-results.json THEN 系统 SHALL 在可恢复步骤列表中包含 codex_review
4. WHEN 工作目录中存在 codex-review-results.json THEN 系统 SHALL 在可恢复步骤列表中包含 cross_validation
5. WHEN 工作目录中存在 cross-validation-results.json THEN 系统 SHALL 在可恢复步骤列表中包含 report_generation
6. THE 返回的步骤列表 SHALL 按照 Pipeline 执行顺序排序

### 需求 4：Pipeline 步骤跳过

**用户故事：** 作为系统，我需要能够跳过已完成的步骤，直接使用已有的输出文件继续执行。

#### 验收标准

1. WHEN Pipeline 从 test_execution 步骤恢复执行 THEN 系统 SHALL 跳过 initialize 和 prd_parsing 步骤
2. WHEN Pipeline 跳过某个步骤 THEN 系统 SHALL 记录该步骤为 skipped 状态
3. WHEN Pipeline 恢复执行 THEN 系统 SHALL 正确加载已有的输出文件作为后续步骤的输入
4. WHEN Pipeline 恢复执行成功 THEN 系统 SHALL 更新 TestRun 的状态为对应步骤的状态
5. THE Pipeline 执行结果 SHALL 包含所有步骤的状态（包括 skipped 状态的步骤）

### 需求 5：前端恢复执行界面

**用户故事：** 作为用户，我希望能够在测试运行详情页面看到恢复执行的选项，以便方便地从指定步骤继续执行。

#### 验收标准

1. WHEN 用户查看已完成或失败的 TestRun 详情页 THEN 系统 SHALL 显示"恢复执行"按钮
2. WHEN 用户点击"恢复执行"按钮 THEN 系统 SHALL 显示可恢复步骤的下拉列表
3. WHEN 用户选择步骤并确认恢复 THEN 系统 SHALL 调用 resumeRun API 并显示执行进度
4. WHEN TestRun 正在执行中 THEN 系统 SHALL 禁用"恢复执行"按钮
5. WHEN 没有可恢复的步骤 THEN 系统 SHALL 显示提示信息"无可恢复的步骤"
6. THE 下拉列表中的每个步骤 SHALL 显示步骤名称和对应的中文描述

### 需求 6：状态转换正确性

**用户故事：** 作为系统，我需要确保恢复执行时状态转换的正确性，以便保持数据一致性。

#### 验收标准

1. WHEN Pipeline 从某个步骤恢复执行 THEN 系统 SHALL 将 TestRun 状态更新为该步骤对应的状态
2. WHEN 恢复执行失败 THEN 系统 SHALL 将 TestRun 状态更新为 failed，并记录错误原因
3. WHEN 恢复执行成功完成 THEN 系统 SHALL 将 TestRun 状态更新为 completed
4. THE 状态转换 SHALL 遵循现有的状态机规则，不允许非法状态转换
5. WHEN 恢复执行开始 THEN 系统 SHALL 在 decision_log 中记录恢复执行的操作

### 需求 7：WebSocket 事件通知

**用户故事：** 作为用户，我希望在恢复执行过程中能够实时看到执行进度，以便了解当前执行状态。

#### 验收标准

1. WHEN Pipeline 恢复执行开始 THEN 系统 SHALL 通过 WebSocket 发送 pipeline:resumed 事件
2. WHEN Pipeline 跳过某个步骤 THEN 系统 SHALL 通过 WebSocket 发送 step_skipped 事件
3. WHEN Pipeline 恢复执行的步骤开始执行 THEN 系统 SHALL 通过 WebSocket 发送 step_started 事件
4. THE WebSocket 事件 SHALL 包含 runId、step、timestamp 等必要信息

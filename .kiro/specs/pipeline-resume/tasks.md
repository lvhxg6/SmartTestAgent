# 实现计划：Pipeline 恢复执行功能

## 概述

本实现计划将 Pipeline 恢复执行功能分解为可执行的编码任务。采用增量开发方式，每个任务都建立在前一个任务的基础上，确保代码始终处于可运行状态。

## 任务列表

- [x] 1. 实现 PrerequisiteValidator 核心组件
  - [x] 1.1 创建 PrerequisiteValidator 类和类型定义
    - 创建 `packages/core/src/pipeline/prerequisite-validator.ts`
    - 定义 `PipelineStep`、`ResumableStep` 类型
    - 定义 `STEP_PREREQUISITES` 常量（步骤前置文件映射）
    - 定义 `STEP_ORDER` 常量（步骤执行顺序）
    - 定义 `STEP_LABELS` 常量（步骤中文名称映射）
    - 实现 `ValidationResult` 和 `ResumableStepInfo` 接口
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [x] 1.2 实现 validateStep 方法
    - 实现文件存在检查逻辑
    - 支持检查 test-cases/ 目录作为 test-cases.json 的替代
    - 返回 ValidationResult 对象
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 1.3 实现 getResumableSteps 方法
    - 遍历所有可恢复步骤
    - 调用 validateStep 检查每个步骤
    - 按 STEP_ORDER 顺序返回结果
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [ ]* 1.4 编写 PrerequisiteValidator 属性测试
    - **Property 1: 前置文件验证一致性**
    - **Property 2: 缺失文件报告完整性**
    - **Property 3: 可恢复步骤与文件存在一致性**
    - **Property 4: 可恢复步骤排序正确性**
    - **Validates: Requirements 2.1-2.7, 3.1-3.6**

- [x] 2. 扩展 Pipeline 核心支持恢复执行
  - [x] 2.1 扩展 PipelineConfig 接口
    - 在 `packages/core/src/pipeline/index.ts` 中添加 `startFromStep` 和 `isResume` 字段
    - 导出 PrerequisiteValidator 相关类型
    - _Requirements: 4.1_
  
  - [x] 2.2 扩展 PipelineEventType 类型
    - 在 `packages/shared/src/types/index.ts` 中添加 `step_skipped` 和 `pipeline_resumed` 事件类型
    - _Requirements: 7.1, 7.2_
  
  - [x] 2.3 修改 TestPipeline.execute 方法支持跳过步骤
    - 根据 startFromStep 计算需要跳过的步骤
    - 为跳过的步骤创建 skipped 状态的 StepResult
    - 发送 step_skipped 事件
    - 发送 pipeline_resumed 事件
    - _Requirements: 4.1, 4.2, 4.5, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 2.4 编写 Pipeline 跳过步骤属性测试
    - **Property 5: 跳过步骤标记正确性**
    - **Property 8: WebSocket 跳过事件完整性**
    - **Validates: Requirements 4.1, 4.2, 4.5, 7.2, 7.4**

- [x] 3. Checkpoint - 确保核心组件测试通过
  - 运行所有测试，确保通过
  - 如有问题，询问用户

- [x] 4. 实现 PipelineRunner 恢复执行方法
  - [x] 4.1 添加 resumePipeline 方法
    - 在 `apps/server/src/services/pipeline-runner.ts` 中添加方法
    - 验证 TestRun 存在
    - 验证 TestRun 状态允许恢复（非 executing/codex_reviewing）
    - 调用 PrerequisiteValidator 验证前置文件
    - 构建 PipelineConfig 并设置 startFromStep
    - 执行 Pipeline
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 6.1, 6.2, 6.3, 6.5_
  
  - [x] 4.2 添加状态转换映射
    - 定义 RESUME_STEP_TO_STATE 映射
    - 在恢复执行时更新 TestRun 状态
    - _Requirements: 6.1, 6.4_
  
  - [ ]* 4.3 编写 PipelineRunner 恢复执行属性测试
    - **Property 6: 运行中状态阻止恢复**
    - **Property 7: 恢复执行状态转换正确性**
    - **Validates: Requirements 1.5, 6.1, 6.4**

- [x] 5. 实现 tRPC API
  - [x] 5.1 添加 getResumableSteps 路由
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 定义输入 schema（runId）
    - 调用 PrerequisiteValidator.getResumableSteps
    - 返回可恢复步骤列表
    - _Requirements: 3.1_
  
  - [x] 5.2 添加 resumeRun 路由
    - 定义输入 schema（runId, fromStep）
    - 调用 PipelineRunner.resumePipeline
    - 处理错误并返回适当的错误响应
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ]* 5.3 编写 tRPC API 单元测试
    - 测试输入验证
    - 测试错误响应
    - 测试成功响应
    - _Requirements: 1.1-1.6_

- [x] 6. Checkpoint - 确保后端 API 测试通过
  - 运行所有测试，确保通过
  - 如有问题，询问用户

- [x] 7. 实现前端恢复执行界面
  - [x] 7.1 创建 ResumeRunDialog 组件
    - 创建 `apps/web/src/components/ResumeRunDialog.tsx`
    - 实现对话框 UI，包含步骤下拉列表
    - 调用 getResumableSteps API 获取可恢复步骤
    - 显示步骤名称和中文描述
    - _Requirements: 5.2, 5.5, 5.6_
  
  - [x] 7.2 在 TestRun 详情页添加恢复执行按钮
    - 修改 `apps/web/src/pages/TestRunDetail.tsx`（或对应的详情页组件）
    - 添加"恢复执行"按钮
    - 根据 TestRun 状态控制按钮显示/禁用
    - 点击按钮打开 ResumeRunDialog
    - _Requirements: 5.1, 5.4_
  
  - [x] 7.3 实现恢复执行确认逻辑
    - 调用 resumeRun API
    - 显示执行进度
    - 处理错误并显示提示
    - _Requirements: 5.3_
  
  - [ ]* 7.4 编写前端组件单元测试
    - 测试 ResumeRunDialog 渲染
    - 测试按钮状态控制
    - 测试 API 调用
    - _Requirements: 5.1-5.6_

- [x] 8. 最终 Checkpoint - 确保所有测试通过
  - 运行所有测试，确保通过
  - 如有问题，询问用户

## 注意事项

- 标记 `*` 的任务为可选任务，可以跳过以加快 MVP 开发
- 每个任务都引用了具体的需求条款，确保可追溯性
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界条件
- Checkpoint 任务用于确保增量开发的稳定性

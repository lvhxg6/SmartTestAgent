# 实现计划：测试用例审批流程优化

## 概述

本实现计划将测试用例审批流程优化功能分解为可执行的编码任务。采用增量开发方式，确保代码始终处于可运行状态。

## 任务列表

- [x] 1. 修复审批状态流转问题
  - [x] 1.1 分析当前状态流转问题
    - 阅读 `packages/core/src/pipeline/index.ts` 中的 execute 方法
    - 阅读 `apps/server/src/services/pipeline-runner.ts` 中的 startPipeline 方法
    - 确认 `approval_required` 事件触发后 Pipeline 是否正确暂停
    - _Requirements: 1.1, 1.2_
  
  - [x] 1.2 修改 Pipeline 执行逻辑支持审批暂停
    - 在 `PipelineConfig` 中添加 `skipApprovalWait` 字段
    - 在 `PipelineResult` 中添加 `awaitingApproval`、`testCasesPath`、`requirementsPath` 字段
    - 修改 `execute` 方法，在 `approval_required` 事件后返回中间结果
    - 确保状态正确更新为 `awaiting_approval`
    - _Requirements: 1.1, 1.2, 1.5_
  
  - [x] 1.3 修改 PipelineRunner 支持审批后继续执行
    - 添加 `continueAfterApproval` 方法
    - 在 `submitApproval` 成功后调用此方法继续执行
    - _Requirements: 1.3, 1.4_

- [x] 2. 实现测试用例和需求查询 API
  - [x] 2.1 添加 getTestCases API
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 从工作目录读取 `test-cases.json` 或 `test-cases/` 目录
    - 支持按需求 ID 筛选
    - 返回按需求分组的测试用例
    - _Requirements: 2.1, 2.2, 2.3, 8.1_
  
  - [x] 2.2 添加 getRequirements API
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 从工作目录读取 `requirements.json`
    - 返回按优先级分组的需求列表
    - _Requirements: 3.1, 3.2, 3.4, 8.2_

- [x] 3. Checkpoint - 确保后端 API 可用
  - 运行 `pnpm build` 确保编译通过

- [x] 4. 实现重新生成功能
  - [x] 4.1 添加 regenerateTestCases API
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 定义反馈类型枚举（coverage_incomplete, steps_incorrect, assertions_inaccurate, other）
    - 验证 TestRun 状态为 `awaiting_approval`
    - 检查重新生成次数（最大 3 次）
    - 记录反馈到 decision_log
    - _Requirements: 5.1, 5.4, 5.5, 8.5_
  
  - [x] 4.2 实现基于反馈的重新生成逻辑
    - 在 `apps/server/src/services/pipeline-runner.ts` 中添加 `regenerateTestCases` 方法
    - 创建包含反馈信息的 prompt
    - 调用 Claude Code 重新生成测试用例
    - 更新状态为 `awaiting_approval`
    - _Requirements: 5.2, 5.3_

- [x] 5. 实现 Playwright 脚本生成器
  - [x] 5.1 创建 ScriptGenerator 组件
    - 创建 `packages/core/src/script-generator/index.ts`
    - 实现 `generateForTestCase` 方法 - 为单个测试用例生成脚本
    - 实现 `generateForTestCases` 方法 - 为多个测试用例生成脚本
    - 实现 `generateExecutableScript` 方法 - 生成完整可执行脚本
    - 使用 `prompts/ui-test-execute.md` 中的模板逻辑
    - _Requirements: 6.1, 6.5_
  
  - [x] 5.2 添加 generateScript API
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 读取 target-profile.json 获取配置
    - 调用 ScriptGenerator 生成脚本
    - 返回脚本内容
    - _Requirements: 6.1, 6.3, 8.3_
  
  - [x] 5.3 添加 downloadScript API
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 支持单文件下载（.js）
    - 支持多文件打包下载（.zip）- 使用 archiver 库
    - 添加注释说明测试用例来源和生成时间
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.4_

- [x] 6. 更新前端脚本预览组件
  - [x] 6.1 修改 ScriptPreviewModal 调用真实 API
    - 修改 `apps/web/src/components/ScriptPreviewModal.tsx`
    - 调用 `generateScript` API 获取真实脚本
    - 显示加载状态
    - 支持错误处理
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 6.2 实现脚本下载功能
    - 调用 `downloadScript` API
    - 支持单文件和 zip 格式下载
    - _Requirements: 7.1, 7.2_

- [x] 7. 实现 Codex 审核结果展示
  - [x] 7.1 添加 getCodexReviewResults API
    - 在 `apps/server/src/trpc/routers/testRun.ts` 中添加路由
    - 从工作目录读取 `codex-review-results.json`
    - 返回审核结果数据
    - _Requirements: 8.6, 9.1_
  
  - [x] 7.2 创建 CodexReviewResults 组件
    - 创建 `apps/web/src/components/CodexReviewResults.tsx`
    - 显示审核摘要（总断言数、同意数、不同意数、不确定数）
    - 显示误报/漏报检测数量
    - _Requirements: 9.1, 9.2_
  
  - [x] 7.3 创建 P0CoverageCard 组件
    - 创建 `apps/web/src/components/P0CoverageCard.tsx`
    - 显示 P0 需求覆盖状态
    - 列出未覆盖的 P0 需求
    - _Requirements: 9.2_
  
  - [x] 7.4 创建 ConflictList 组件
    - 创建 `apps/web/src/components/ConflictList.tsx`
    - 显示判定冲突列表
    - 支持按冲突类型筛选
    - 显示原始判定、Codex 判定、理由、建议
    - _Requirements: 9.3, 9.4, 9.6_
  
  - [x] 7.5 创建 SoftAssertionList 组件
    - 创建 `apps/web/src/components/SoftAssertionList.tsx`
    - 显示软断言的 Codex 判定和理由
    - _Requirements: 9.5_

- [x] 8. 整合 Codex 审核结果到 TestRunDetail 页面
  - [x] 8.1 修改 TestRunDetail 页面
    - 在 `apps/web/src/pages/TestRunDetail.tsx` 中集成 CodexReviewResults 组件
    - 当状态为 `report_ready` 或 `completed` 时显示审核结果
    - 添加 Tab 切换测试报告和审核结果
    - _Requirements: 9.1_

- [x] 9. 已完成的前端审批页面
  - [x] 9.1 创建 RequirementList 组件
    - 创建 `apps/web/src/components/RequirementList.tsx`
    - 显示需求 ID、标题、描述、优先级
    - 支持点击选择需求
    - 按优先级排序显示
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 9.2 创建 TestCaseList 组件
    - 创建 `apps/web/src/components/TestCaseList.tsx`
    - 使用 Collapse 组件展示测试用例
    - 支持按需求筛选
    - _Requirements: 2.1, 2.3, 2.4_
  
  - [x] 9.3 创建 TestCaseDetail 组件（内嵌在 TestCaseList 中）
    - 显示测试用例完整信息（步骤、断言等）
    - _Requirements: 2.2_
  
  - [x] 9.4 创建 ApprovalActions 组件
    - 创建 `apps/web/src/components/ApprovalActions.tsx`
    - 添加批准、拒绝、预览脚本、下载脚本按钮
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 9.5 创建 RejectFeedbackModal（内嵌在 ApprovalActions 中）
    - 支持选择反馈类型
    - 支持填写详细反馈
    - _Requirements: 4.3, 4.4_
  
  - [x] 9.6 创建 ScriptPreviewModal 组件（占位符版本）
    - 创建 `apps/web/src/components/ScriptPreviewModal.tsx`
    - 使用语法高亮显示脚本
    - 支持下载功能
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 10. 已完成的前端审批页面整合
  - [x] 10.1 修改 TestRunDetail 页面
    - 在 `apps/web/src/pages/TestRunDetail.tsx` 中集成审批组件
    - 当状态为 `awaiting_approval` 时显示审批界面
    - 添加 Tab 切换需求列表和测试用例列表
    - _Requirements: 2.1, 3.1, 4.1_
  
  - [x] 10.2 实现审批操作逻辑
    - 调用 submitApproval API 处理批准
    - 调用 regenerateTestCases API 处理拒绝（暂用 submitApproval 拒绝功能）
    - 显示操作结果提示
    - _Requirements: 4.2, 4.3, 4.5_

- [x] 11. Checkpoint - 确保所有功能完整
  - 运行 `pnpm build` 确保编译通过
  - 运行 `pnpm test` 确保测试通过

- [-] 12. 最终测试和提交
  - [ ] 12.1 端到端测试
    - 测试完整的审批流程
    - 测试拒绝后重新生成流程
    - 测试脚本预览和下载功能
    - 测试 Codex 审核结果展示
  
  - [x] 12.2 提交代码
    - 提交所有更改到 Git
    - Push 到远程 GitHub 仓库

## 注意事项

- 每个任务完成后都要运行编译测试
- 遵循现有代码风格和命名规范
- 确保 WebSocket 事件正确触发
- 错误处理要完善，返回有意义的错误信息
- ScriptGenerator 生成的脚本应与 `prompts/ui-test-execute.md` 中的模板保持一致

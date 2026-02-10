# Implementation Plan: PRD-Based UI Testing Agent System

## Overview

本实施计划实现精简版 PRD-Based UI Testing Agent System，核心功能：PRD → 测试用例生成 → Playwright UI 自动化执行（读写操作）→ AI 交叉审核 → 源码定位与根因分析 → Markdown 缺陷报告。采用 Monorepo 架构，使用 TypeScript 全栈开发。

## Tasks

- [x] 1. 项目初始化与基础架构
  - [x] 1.1 初始化 Monorepo 项目结构
    - 使用 Turborepo + pnpm 创建 monorepo
    - 创建 apps/web、apps/server、packages/core、packages/shared、packages/db 目录
    - 配置 turbo.json 和 pnpm-workspace.yaml
    - _Requirements: 15.1_
  
  - [x] 1.2 配置 TypeScript 和共享类型
    - 创建 packages/shared/types 目录
    - 定义核心类型：TargetProfile、TestRun、TestCase、Assertion 等
    - 配置 tsconfig.json 继承关系
    - _Requirements: 1.1, 15.2_
  
  - [x] 1.3 配置 Prisma 数据库层
    - 创建 packages/db 包
    - 编写 Prisma schema（Project、TargetProfile、TestRun、Requirement、TestCase、Assertion）
    - 配置 SQLite 连接
    - _Requirements: 15.1, 15.4_
  
  - [x] 1.4 编写数据库层单元测试
    - 测试 CRUD 操作
    - 测试关联关系
    - _Requirements: 15.4_

- [ ] 2. Target Profile Manager 实现
  - [x] 2.1 实现 Target Profile 配置接口
    - 创建 packages/core/target-profile 模块
    - 实现 TargetProfileManager 类
    - 支持 base_url、login、allowed_routes、source_code 配置
    - 支持 browser.ignoreHTTPSErrors 配置
    - 支持 antd_quirks 配置（button_text_space、select_type、modal_close_selector）
    - 支持 ui_framework 字段
    - 支持写操作配置（create、edit、delete）
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  
  - [x] 2.2 实现环境变量解析
    - 支持 $VAR_NAME 格式的环境变量引用
    - 实现凭证解析函数
    - _Requirements: 1.3_
  
  - [x] 2.3 实现配置验证逻辑
    - 验证必填字段
    - 验证 URL 格式
    - 验证路由路径格式
    - _Requirements: 1.2_
  
  - [x] 2.4 编写 Target Profile 属性测试
    - **Property 1: Target Profile Configuration Round-Trip**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 3. Checkpoint - 确保配置管理模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. Source Indexer 实现
  - [x] 4.1 实现路由文件解析器
    - 创建 packages/core/source-indexer 模块
    - 支持 vue-router 格式解析
    - 支持 react-router 格式解析
    - 实现路由到组件路径映射
    - _Requirements: 2.1, 2.9_
  
  - [x] 4.2 实现 Vue 组件提取器
    - 解析 .vue 文件
    - 提取 template 和 script 部分
    - 实现 >500 行裁剪逻辑
    - 提取 API 导入引用
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7_
  
  - [x] 4.3 实现 React 组件提取器
    - 解析 .tsx/.jsx 文件
    - 提取 JSX return 和 hooks
    - 实现 >500 行裁剪逻辑
    - 提取 API 导入引用
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.8_
  
  - [x] 4.4 实现框架类型检测
    - 基于路由文件模式检测 vue/react
    - _Requirements: 2.9_
  
  - [x] 4.5 编写 Source Indexer 属性测试
    - **Property 5: Route to Component Mapping**
    - **Property 6: Source File Extraction Preserves Key Content**
    - **Property 7: Framework Detection Accuracy**
    - **Validates: Requirements 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9**

- [x] 5. CLI Adapter 实现
  - [x] 5.1 实现 CLI 能力探测
    - 创建 packages/core/cli-adapter 模块
    - 探测 claude --help 输出
    - 探测 codex --help 输出
    - 构建能力映射
    - _Requirements: 16.1, 16.2_
  
  - [x] 5.2 实现 Claude Code 调用封装
    - 支持 stream-json 和 json 输出格式
    - 支持 allowed-tools 参数
    - 实现降级策略
    - _Requirements: 16.3, 16.4_
  
  - [x] 5.3 实现 Codex 调用封装
    - 支持 suggest-mode
    - 支持 output-schema
    - 支持图片输入
    - 实现降级策略
    - _Requirements: 16.3, 16.4_
  
  - [x] 5.4 实现降级决策记录
    - 记录到 manifest.json
    - _Requirements: 16.5_
  
  - [x] 5.5 编写 CLI Adapter 属性测试
    - **Property 33: CLI Capability Detection**
    - **Property 34: CLI Degradation Behavior**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**

- [ ] 6. Checkpoint - 确保核心模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 7. Orchestrator 状态机实现
  - [ ] 7.1 实现状态机核心逻辑
    - 创建 packages/core/orchestrator 模块
    - 实现 8 态状态机（created → parsing → generating → awaiting_approval → executing → codex_reviewing → report_ready → completed）
    - 实现 failed 终态和 reason_code
    - _Requirements: 14.1, 14.2_
  
  - [ ] 7.2 实现状态转换逻辑
    - 实现各状态间的合法转换
    - 实现审批/拒绝转换
    - 实现确认/重测转换
    - 实现超时转换（24h 审批超时、48h 确认超时）
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 13.1, 13.3, 13.4, 13.5_
  
  - [ ] 7.3 实现幂等性保证
    - 使用 run_id + state + shard_id 作为幂等键
    - 重复转换返回 no-op
    - _Requirements: 14.4, 14.5_
  
  - [ ] 7.4 实现状态转换日志
    - 记录到 manifest decision_log
    - _Requirements: 14.3_
  
  - [ ] 7.5 编写状态机属性测试
    - **Property 14: State Machine Transition Correctness**
    - **Property 15: State Machine Idempotency**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5, 14.1, 14.2, 14.4, 14.5**

- [ ] 8. Playwright Runner 实现
  - [ ] 8.1 实现测试脚本生成器
    - 创建 packages/playwright-runner 包
    - 生成完整的 Playwright JS 测试脚本
    - 包含浏览器启动、登录、导航、操作、截图、断言、结果输出
    - 支持写操作（create、edit、delete）
    - _Requirements: 7.1, 7.2_
  
  - [ ] 8.2 实现 Ant Design 选择器策略
    - 两字中文按钮使用正则（/关.*闭/）
    - 三字及以上按钮使用精确匹配
    - Select 组件使用 .ant-select-selector + .ant-select-item-option
    - Modal 关闭优先使用 .ant-modal-close
    - 视口外元素使用 scrollIntoViewIfNeeded()
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.10_
  
  - [ ] 8.3 实现选择器优先级逻辑
    - getByRole > getByText > getByPlaceholder > getByLabel > getByTestId > CSS locator
    - _Requirements: 4.2_
  
  - [ ] 8.4 实现脚本执行器
    - 通过 node 命令执行生成的脚本
    - 收集截图到 evidence/screenshots/
    - 输出执行结果 JSON
    - _Requirements: 7.3, 7.4, 7.5_
  
  - [ ] 8.5 实现 soft 断言处理
    - soft 类型断言包含 agent_verdict 和 agent_reasoning
    - _Requirements: 7.6_
  
  - [ ] 8.6 实现错误处理
    - 捕获 Playwright 错误（元素未找到、超时）
    - 记录 playwright_error reason_code
    - _Requirements: 7.7_
  
  - [ ] 8.7 实现测试数据管理
    - 生成数据准备步骤
    - 生成数据清理步骤
    - 失败时仍执行清理
    - _Requirements: 4.11, 7.8, 19.1, 19.2, 19.3, 19.4, 19.5_
  
  - [ ] 8.8 编写 Playwright Runner 属性测试
    - **Property 4: Ant Design Button Selector Pattern**
    - **Property 9: Selector Priority Ordering**
    - **Property 17: Test Script Structure Completeness**
    - **Validates: Requirements 4.2, 4.3, 4.4, 7.1, 7.2**

- [ ] 9. Checkpoint - 确保执行层测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 10. 交叉验证与裁决实现
  - [ ] 10.1 实现 Codex 审核结果解析
    - 解析 codex-review-results.json
    - 提取 review_verdict 和 conflict_type
    - _Requirements: 8.2, 8.3, 8.4_
  
  - [ ] 10.2 实现交叉验证裁决逻辑
    - 确定性断言：machine_verdict + agree → 维持
    - 确定性断言：machine_verdict + disagree → failed
    - 确定性断言：machine_verdict + uncertain → 维持
    - soft 断言：agent_verdict + agree → 维持
    - soft 断言：agent_verdict + disagree/uncertain → failed
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ] 10.3 实现 P0 覆盖检查
    - 验证所有 P0 需求有对应测试用例
    - 输出 p0_coverage_check 结构
    - _Requirements: 5.4, 5.5_
  
  - [ ] 10.4 编写交叉验证属性测试
    - **Property 23: Cross-Validation Arbitration Rules**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [ ] 11. Markdown 缺陷报告生成实现
  - [ ] 11.1 实现缺陷聚合
    - 收集所有 final_verdict = fail 的断言
    - _Requirements: 10.1_
  
  - [ ] 11.2 实现 Markdown 报告生成
    - 包含缺陷描述、截图链接、操作步骤回放
    - 分配严重程度（critical/major/minor/suggestion）
    - 包含摘要（总缺陷数、严重程度分布、受影响路由）
    - _Requirements: 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 11.3 编写报告生成属性测试
    - **Property 24: Defect Report Aggregation**
    - **Validates: Requirements 10.1**

- [ ] 12. Quality Gate 实现
  - [ ] 12.1 实现 RC 计算
    - covered_reqs / total_reqs（仅 testable=true）
    - _Requirements: 11.1_
  
  - [ ] 12.2 实现 APR 计算
    - passed / executed（仅确定性断言）
    - _Requirements: 11.2_
  
  - [ ] 12.3 实现 FR 计算
    - 需要 ≥3 次历史执行
    - flaky / automated
    - _Requirements: 11.5_
  
  - [ ] 12.4 实现门禁阈值检查
    - RC < 0.85 或 P0 未覆盖 → 阻断
    - APR < 0.95 → 告警
    - FR > 0.05 → 告警 + 标记 flaky
    - _Requirements: 11.3, 11.4, 11.6_
  
  - [ ] 12.5 编写 Quality Gate 属性测试
    - **Property 26: Requirements Coverage Calculation**
    - **Property 27: Assertion Pass Rate Calculation**
    - **Validates: Requirements 11.1, 11.2**

- [ ] 13. Checkpoint - 确保核心业务逻辑测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 14. 工作空间管理实现
  - [ ] 14.1 实现工作空间目录创建
    - 创建 .ai-test-workspace/{run_id}/ 结构
    - 创建 source-context/、evidence/screenshots/、evidence/traces/ 子目录
    - _Requirements: 14.1_
  
  - [ ] 14.2 实现 manifest.json 管理
    - 记录 run_id、project_id、status
    - 记录 agent_versions、prompt_versions
    - 记录 artifacts SHA256 校验和
    - 记录 decision_log
    - 记录 env_fingerprint
    - _Requirements: 14.2, 14.3_
  
  - [ ] 14.3 实现追溯链完整性检查
    - 验证 requirement_id → case_id → assertion_id → evidence 链路
    - 缺失任一层级排除出门禁计算
    - _Requirements: 14.4, 14.5_
  
  - [ ] 14.4 编写工作空间属性测试
    - **Property 30: Workspace Directory Structure**
    - **Property 31: Manifest Completeness**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [ ] 15. JSON Schema 验证实现
  - [ ] 15.1 创建 JSON Schema 定义文件
    - requirements.json schema
    - test-cases.json schema
    - execution-results.json schema
    - codex-review-results.json schema（含 p0_coverage_check）
    - _Requirements: 3.2, 4.7, 5.2, 7.5_
  
  - [ ] 15.2 实现 Schema 验证器
    - 使用 ajv 进行 JSON Schema 验证
    - _Requirements: 3.2, 4.7, 4.8, 5.2, 7.5, 8.3_
  
  - [ ] 15.3 编写 Schema 验证属性测试
    - **Property 8: JSON Output Schema Compliance**
    - **Validates: Requirements 3.2, 4.7, 4.8, 5.2, 7.5, 8.3**

- [ ] 16. Checkpoint - 确保所有核心模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 17. API Layer 实现
  - [ ] 17.1 初始化 Express + tRPC 服务
    - 创建 apps/server 应用
    - 配置 Express 中间件
    - 配置 tRPC router
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  
  - [ ] 17.2 实现项目管理 API
    - 创建/更新/删除项目
    - 获取项目列表
    - _Requirements: 17.1_
  
  - [ ] 17.3 实现 Target Profile API
    - 保存/获取 Target Profile
    - 验证配置
    - _Requirements: 1.1, 1.2, 17.1_
  
  - [ ] 17.4 实现测试运行 API
    - 创建测试运行
    - 获取运行状态
    - 提交审批/确认决策
    - _Requirements: 6.2, 6.3, 6.4, 12.2, 12.3, 12.4_
  
  - [ ] 17.5 实现报告 API
    - 获取 Markdown 测试报告
    - 获取缺陷列表
    - 获取截图
    - _Requirements: 17.4_

- [ ] 18. WebSocket 实时推送实现
  - [ ] 18.1 配置 Socket.IO
    - 集成到 Express 服务
    - 配置房间管理（按 run_id）
    - _Requirements: 16.1, 16.2_
  
  - [ ] 18.2 实现事件推送
    - state_transition 事件 → current_state
    - step_completed 事件 → completed_steps
    - step_screenshot 事件 → step_screenshot_preview
    - _Requirements: 16.3, 16.4, 16.5, 16.6, 16.7_
  
  - [ ] 18.3 编写 WebSocket 属性测试
    - **Property 36: WebSocket Event Structure and Mapping**
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5, 16.6, 16.7**

- [ ] 19. Checkpoint - 确保 API 层测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 20. Web UI 实现
  - [ ] 20.1 初始化 React + Ant Design 前端
    - 创建 apps/web 应用
    - 配置 Vite 构建
    - 配置 Ant Design 5
    - 配置路由（React Router）
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  
  - [ ] 20.2 实现项目配置页面
    - Target Profile 表单
    - 配置验证反馈
    - _Requirements: 17.1_
  
  - [ ] 20.3 实现路由选择页面
    - 路由列表展示
    - 路由选择交互
    - PRD 上传
    - _Requirements: 17.2_
  
  - [ ] 20.4 实现测试执行监控页面
    - 状态机状态展示
    - 已完成/待执行步骤列表
    - 截图预览
    - WebSocket 实时更新
    - _Requirements: 16.1, 16.3, 16.4, 16.5, 16.6, 17.3_
  
  - [ ] 20.5 实现审批/确认界面
    - 测试用例审批界面
    - 报告确认界面
    - _Requirements: 6.2, 12.2, 17.5_
  
  - [ ] 20.6 实现报告查看页面
    - Markdown 报告渲染
    - 缺陷列表
    - 截图查看
    - 质量门禁指标展示
    - _Requirements: 17.4_

- [ ] 21. Prompt 模板实现
  - [ ] 21.1 编写 PRD 解析 Prompt
    - prd-parse.md 模板
    - 输入：PRD 原文 + 路由表 + 页面源码 + API 定义
    - 输出：requirements.json + test-cases.json
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.7, 4.8, 4.9, 4.11_
  
  - [ ] 21.2 编写测试执行 Prompt
    - ui-test-execute.md 模板
    - 输入：test-cases.json + target-profile.json
    - 输出：test-{run_id}.js + execution-results.json
    - _Requirements: 7.1, 7.2_
  
  - [ ] 21.3 编写结果审核 Prompt
    - review-results.md 模板
    - 输入：test-cases.json + execution-results.json + 截图 + PRD
    - 输出：codex-review-results.json
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 22. 端到端集成
  - [ ] 22.1 实现完整流程编排
    - 串联所有步骤：配置 → 源码索引 → PRD 解析 → 用例生成 → 审批 → 执行（读写操作）→ 审核 → 裁决 → Markdown 报告 → 确认
    - _Requirements: 全部_
  
  - [ ] 22.2 实现错误恢复机制
    - 各阶段错误捕获
    - 状态回滚
    - 重试逻辑
    - _Requirements: 7.7, 13.2_

- [ ] 23. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户
  - 验证端到端流程（读写操作）
  - 验证 Markdown 报告生成
  - 验收指标：P0 覆盖率 = 1.00 / 总体 RC ≥ 0.85 / APR ≥ 0.95 / 零未知状态转换

## Notes

- 所有测试任务（单元测试、属性测试）均为必须执行的任务
- 每个任务引用具体的 Requirements 以确保可追溯性
- Checkpoint 任务用于阶段性验证，确保增量交付质量
- 属性测试使用 fast-check 库，每个属性至少运行 100 次迭代
- 单元测试聚焦边界情况和错误条件
- 本计划共 23 个主要任务，聚焦核心功能

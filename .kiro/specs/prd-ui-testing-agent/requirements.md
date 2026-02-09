# Requirements Document

## Introduction

PRD-Based UI Testing Agent System 是一个基于 AI 的自动化测试系统，实现 PRD → 测试用例生成 → Playwright UI 自动化执行（读写操作）→ AI 交叉审核 → 源码定位与根因分析 → Markdown 缺陷报告 的完整闭环。系统采用 Claude Code 执行测试生成和执行，Codex 进行交叉审核，通过源码辅助生成机制提升 Playwright 脚本准确率。

## Glossary

- **Test_Agent_System**: PRD-Based UI Testing Agent 系统，负责整个测试流程的编排和执行
- **Claude_Code**: Claude Code CLI，负责 PRD 解析、测试用例生成、Playwright 脚本生成和执行、源码分析
- **Codex**: Codex CLI，负责测试用例质量审核和执行结果交叉审核
- **Orchestrator**: 编排引擎，负责状态机流转、任务调度和质量门禁计算
- **Source_Indexer**: 源码索引器，负责解析前端路由表并提取页面组件和 API 定义
- **Target_Profile**: 测试对象配置，包含目标服务地址、登录凭证、允许的路由和操作类型
- **Test_Run**: 一次完整的测试执行流程，从 PRD 解析到报告生成
- **Assertion**: 测试断言，分为确定性断言（machine_verdict）和 AI 判定断言（soft/agent_verdict）
- **Quality_Gate**: 质量门禁，包括需求覆盖率(RC)、断言通过率(APR)、用例不稳定率(FR)等指标

## Requirements

### Requirement 1: 项目配置管理

**User Story:** As a 测试工程师, I want to 配置测试目标项目的基本信息, so that 系统能够正确连接目标服务并执行测试。

#### Acceptance Criteria

1. THE Target_Profile_Manager SHALL provide a configuration interface for setting base_url, login credentials, allowed_routes, and source_code paths
2. WHEN a user saves target profile configuration, THE Target_Profile_Manager SHALL validate all required fields are present and store the configuration
3. THE Target_Profile_Manager SHALL support environment variable references for sensitive credentials (e.g., $TEST_USERNAME, $TEST_PASSWORD)
4. THE Target_Profile_Manager SHALL support browser configuration with ignoreHTTPSErrors boolean field for self-signed certificate handling
5. WHEN browser.ignoreHTTPSErrors is set to true, THE Test_Agent_System SHALL create Playwright browser context with ignoreHTTPSErrors option enabled
6. THE Target_Profile_Manager SHALL support antd_quirks configuration object with button_text_space (boolean), select_type (string: 'custom'/'native'), and modal_close_selector (string) fields
7. WHEN antd_quirks.button_text_space is true, THE Test_Agent_System SHALL apply regex patterns for two-character Chinese button text matching
8. THE Target_Profile_Manager SHALL support ui_framework field to indicate the frontend framework type (e.g., 'antd', 'element-ui')
9. THE Target_Profile_Manager SHALL support write operations configuration including create, edit, delete in allowed_operations

### Requirement 2: 源码索引与上下文提取

**User Story:** As a 测试工程师, I want to 系统自动从前端源码中提取测试上下文, so that AI 能够生成准确的 Playwright 选择器和测试步骤。

#### Acceptance Criteria

1. WHEN a user specifies a test route, THE Source_Indexer SHALL parse the router file and locate the corresponding page component file path
2. WHEN a page component is identified, THE Source_Indexer SHALL extract referenced API definition files
3. THE Source_Indexer SHALL output extracted source context files to the workspace source-context directory
4. IF a single source file exceeds 500 lines, THEN THE Source_Indexer SHALL extract only the template and key script sections
5. THE Source_Indexer SHALL support Vue component files (.vue) with template and script section extraction
6. THE Source_Indexer SHALL support React component files (.tsx/.jsx) with JSX return block and hook/state definition extraction
7. WHEN processing Vue files exceeding 500 lines, THE Source_Indexer SHALL extract the complete template section and export default object from script section
8. WHEN processing React files exceeding 500 lines, THE Source_Indexer SHALL extract the component function signature, useState/useEffect hooks, and JSX return statement
9. THE Source_Indexer SHALL detect the frontend framework type from router file patterns (vue-router vs react-router)

### Requirement 3: PRD 解析与需求提取

**User Story:** As a 测试工程师, I want to 上传 PRD 文档并自动提取结构化需求, so that 系统能够基于需求生成测试用例。

#### Acceptance Criteria

1. WHEN a PRD document is uploaded, THE Claude_Code SHALL parse the document and extract structured requirements
2. THE Claude_Code SHALL output requirements in JSON format with requirement_id, title, description, priority, testable flag, route, and acceptance_criteria
3. WHEN extracting requirements, THE Claude_Code SHALL assign priority levels (P0/P1/P2) based on business criticality
4. THE Claude_Code SHALL mark each requirement with a testable boolean indicating if it can be UI automated
5. WHEN a requirement references a specific route, THE Claude_Code SHALL include the route path in the requirement definition

### Requirement 4: 测试用例生成

**User Story:** As a 测试工程师, I want to 基于需求和源码上下文自动生成 Playwright 测试用例, so that 我不需要手动编写测试脚本。

#### Acceptance Criteria

1. WHEN requirements and source context are available, THE Claude_Code SHALL generate test cases with Playwright operation steps and selectors
2. THE Claude_Code SHALL follow selector priority: getByRole > getByText > getByPlaceholder > getByLabel > getByTestId > CSS locator
3. WHEN target profile antd_quirks.button_text_space is true and button text is exactly two Chinese characters, THE Claude_Code SHALL use regex pattern with wildcard (e.g., /关.*闭/, /确.*认/, /取.*消/)
4. WHEN button text is three or more Chinese characters, THE Claude_Code SHALL use exact text matching (e.g., '保存配置', '添加盲时规则')
5. WHEN generating selectors for Ant Design Select components, THE Claude_Code SHALL use .ant-select-selector click followed by .ant-select-item-option selection instead of native select operations
6. WHEN generating selectors for Ant Design Modal close, THE Claude_Code SHALL prefer .ant-modal-close (X button) over footer buttons
7. THE Claude_Code SHALL output test cases in JSON format with case_id, requirement_id, route, title, precondition, steps, and assertions
8. WHEN generating assertions, THE Claude_Code SHALL categorize them as element_visible, text_content, element_count, navigation, or soft type
9. THE Claude_Code SHALL include screenshot steps after each significant operation
10. WHEN generating assertions for element visibility, THE Claude_Code SHALL use scrollIntoViewIfNeeded() before visibility check for elements that may be outside viewport
11. WHEN generating test cases for write operations, THE Claude_Code SHALL include data preparation and cleanup steps

### Requirement 5: 测试用例审核

**User Story:** As a 测试工程师, I want to Codex 审核生成的测试用例质量, so that 我能在执行前发现用例问题。

#### Acceptance Criteria

1. WHEN test cases are generated, THE Codex SHALL review coverage completeness, selector stability, and missing scenarios
2. THE Codex SHALL output review results in JSON format with subject_id, review_verdict (agree/disagree/uncertain), reasoning, and p0_coverage_check object
3. IF Codex identifies selector stability issues, THEN THE Codex SHALL provide specific suggestions for improvement
4. THE Codex SHALL verify that all P0 requirements have corresponding test cases and output p0_coverage_check with status (pass/fail) and missing_p0_ids array
5. IF any P0 requirement lacks a corresponding test case, THEN THE Codex SHALL set p0_coverage_check.status to fail and list the missing requirement IDs in missing_p0_ids

### Requirement 6: 人工审批测试计划

**User Story:** As a 测试工程师, I want to 在测试执行前审批测试计划, so that 我能确保测试用例符合预期。

#### Acceptance Criteria

1. WHEN test cases and Codex review are complete, THE Test_Agent_System SHALL transition to awaiting_approval state
2. THE Test_Agent_System SHALL display test case list, operation steps, Codex review opinions, and selector strategies for human review
3. WHEN a user approves the test plan, THE Test_Agent_System SHALL transition to executing state
4. WHEN a user rejects the test plan, THE Test_Agent_System SHALL transition back to generating state for revision
5. IF approval is not received within 24 hours, THEN THE Test_Agent_System SHALL transition to failed state with reason_code approval_timeout

### Requirement 7: Playwright 测试脚本生成与执行

**User Story:** As a 测试工程师, I want to 系统生成完整的 Playwright JS 测试脚本并执行, so that 测试能够高效可复现地运行。

#### Acceptance Criteria

1. WHEN test plan is approved, THE Claude_Code SHALL generate a complete standalone Playwright JS test script
2. THE Claude_Code SHALL include browser launch, login, navigation, operations, screenshots, assertions, and result output in the generated script
3. THE Test_Agent_System SHALL execute the generated script via node command
4. WHEN executing tests, THE Test_Agent_System SHALL capture screenshots at each step and store them in evidence/screenshots directory
5. THE Test_Agent_System SHALL output execution results in JSON format with test case status, steps, and assertions with machine_verdict
6. WHEN an assertion type is soft, THE Claude_Code SHALL provide agent_verdict and agent_reasoning in the execution results
7. IF Playwright execution encounters element not found or timeout errors, THEN THE Test_Agent_System SHALL record the error with playwright_error reason_code
8. WHEN executing write operations, THE Test_Agent_System SHALL execute data cleanup steps after test completion or failure

### Requirement 8: 执行结果交叉审核

**User Story:** As a 测试工程师, I want to Codex 审核测试执行结果, so that 能够检测误报和漏报。

#### Acceptance Criteria

1. WHEN test execution completes, THE Codex SHALL review each assertion result against screenshots and PRD
2. THE Codex SHALL skip assertions with machine_verdict = error and only review assertions with definitive verdicts
3. THE Codex SHALL output review results with review_verdict (agree/disagree/uncertain) and reasoning for each assertion
4. WHEN Codex disagrees with a verdict, THE Codex SHALL specify conflict_type (fact_conflict/evidence_missing/threshold_conflict)
5. THE Codex SHALL detect false positives by comparing screenshots with assertion results
6. THE Codex SHALL detect false negatives by checking for missing verification points

### Requirement 9: 交叉验证裁决

**User Story:** As a 测试工程师, I want to 系统自动裁决 Claude Code 和 Codex 的判定结果, so that 只有真正的冲突才需要人工介入。

#### Acceptance Criteria

1. WHEN machine_verdict and Codex review_verdict are both agree for deterministic assertions, THE Orchestrator SHALL maintain the machine verdict as final result
2. WHEN machine_verdict and Codex review_verdict disagree for deterministic assertions, THE Orchestrator SHALL transition to failed state with verdict_conflict reason_code
3. WHEN agent_verdict and Codex review_verdict disagree for soft assertions, THE Orchestrator SHALL transition to failed state with verdict_conflict reason_code
4. WHEN Codex review_verdict is uncertain for soft assertions, THE Orchestrator SHALL transition to failed state with verdict_conflict reason_code
5. WHEN Codex review_verdict is uncertain for deterministic assertions, THE Orchestrator SHALL maintain the machine verdict as final result

### Requirement 10: 缺陷报告生成

**User Story:** As a 测试工程师, I want to 系统汇总失败的断言并生成 Markdown 格式缺陷报告, so that 我能了解发现的问题并分享给团队。

#### Acceptance Criteria

1. WHEN cross-validation is complete, THE Claude_Code SHALL aggregate all failed assertions into a defect report
2. THE Claude_Code SHALL include defect description, screenshots, and operation step replay in the report
3. THE Claude_Code SHALL assign severity levels (critical/major/minor/suggestion) to each defect
4. THE Claude_Code SHALL output the final report in Markdown format with embedded screenshot links
5. THE Claude_Code SHALL include a summary section with total defects, severity distribution, and affected routes

### Requirement 11: 质量门禁检查

**User Story:** As a 测试工程师, I want to 系统自动计算质量门禁指标, so that 我能判断测试是否达标。

#### Acceptance Criteria

1. WHEN defect report is generated, THE Orchestrator SHALL calculate Requirements Coverage (RC) as covered_reqs / total_reqs
2. THE Orchestrator SHALL calculate Assertion Pass Rate (APR) as passed / executed for deterministic assertions only
3. IF RC is below 0.85 threshold (or P0 requirements not 100% covered), THEN THE Orchestrator SHALL block report generation
4. IF APR is below 0.95 threshold, THEN THE Orchestrator SHALL add a warning flag but not block report generation
5. WHEN test run history has 3 or more executions, THE Orchestrator SHALL calculate Flaky Rate (FR) as flaky / automated
6. IF FR exceeds 0.05 threshold, THEN THE Orchestrator SHALL add a warning flag and mark flaky test cases

### Requirement 12: 报告确认发布

**User Story:** As a 测试工程师, I want to 在报告发布前进行人工确认, so that 我能确保报告内容准确。

#### Acceptance Criteria

1. WHEN quality gate check passes, THE Test_Agent_System SHALL transition to report_ready state
2. THE Test_Agent_System SHALL display final report, defect list, failed case screenshots, and gate metrics for human confirmation
3. WHEN a user confirms the report, THE Test_Agent_System SHALL transition to completed state and save the Markdown report
4. WHEN a user marks the report for retest, THE Test_Agent_System SHALL record the decision and allow new test run creation
5. IF confirmation is not received within 48 hours, THEN THE Test_Agent_System SHALL mark the report as unconfirmed and notify relevant personnel

### Requirement 13: 状态机管理

**User Story:** As a 系统管理员, I want to 系统通过状态机管理测试流程, so that 流程状态清晰可追踪。

#### Acceptance Criteria

1. THE Orchestrator SHALL manage test runs through 8 core states: created, parsing, generating, awaiting_approval, executing, codex_reviewing, report_ready, completed
2. THE Orchestrator SHALL support failed as a terminal state with reason_code for error classification
3. WHEN a state transition occurs, THE Orchestrator SHALL record the transition in the manifest decision_log
4. THE Orchestrator SHALL enforce idempotency using run_id + state + shard_id as the idempotent key
5. IF a duplicate state entry is detected, THEN THE Orchestrator SHALL treat it as no-op to prevent duplicate execution

### Requirement 14: 工作空间与产物管理

**User Story:** As a 测试工程师, I want to 系统管理测试产物和工作空间, so that 所有测试数据可追溯。

#### Acceptance Criteria

1. THE Test_Agent_System SHALL create a workspace directory structure for each test run at .ai-test-workspace/{run_id}/
2. THE Test_Agent_System SHALL store manifest.json with run metadata, agent versions, prompt versions, artifact checksums, and decision log
3. THE Test_Agent_System SHALL capture environment fingerprint including service_version, git_commit, config_hash, and browser_version
4. THE Test_Agent_System SHALL maintain traceability chain: requirement_id → case_id → assertion_id → evidence
5. IF any level of the traceability chain is missing, THEN THE Test_Agent_System SHALL exclude the data from quality gate calculation

### Requirement 15: CLI 集成与能力探测

**User Story:** As a 系统管理员, I want to 系统自动探测 CLI 能力并降级, so that 系统能在不同环境下正常运行。

#### Acceptance Criteria

1. WHEN the system starts, THE Test_Agent_System SHALL probe claude --help and codex --help to build capability mapping
2. THE Test_Agent_System SHALL detect support for stream-json, allowed-tools, and suggest-mode capabilities
3. IF stream-json is not supported, THEN THE Test_Agent_System SHALL fallback to json output format with polling
4. IF allowed-tools is not supported, THEN THE Test_Agent_System SHALL use prompt constraints instead of CLI restrictions
5. THE Test_Agent_System SHALL record degradation decisions in manifest.json

### Requirement 16: 实时监控与推送

**User Story:** As a 测试工程师, I want to 实时查看测试执行进度, so that 我能及时了解测试状态。

#### Acceptance Criteria

1. THE Test_Agent_System SHALL provide a web dashboard for viewing test run status and progress
2. WHEN test state changes, THE Test_Agent_System SHALL push updates via WebSocket to connected clients
3. THE Test_Agent_System SHALL display current_state field showing the current state machine state
4. THE Test_Agent_System SHALL display completed_steps array listing all finished operation steps with timestamps
5. THE Test_Agent_System SHALL display remaining_steps array listing pending operation steps
6. THE Test_Agent_System SHALL provide step_screenshot_preview for each completed step that has an associated screenshot
7. WHEN a WebSocket state_change event is received, THE Test_Agent_System SHALL update current_state, completed_steps, and remaining_steps in real-time

### Requirement 17: Web UI 基础功能

**User Story:** As a 测试工程师, I want to 通过 Web 界面操作测试系统, so that 我能方便地管理测试流程。

#### Acceptance Criteria

1. THE Test_Agent_System SHALL provide a project configuration page for managing target profiles
2. THE Test_Agent_System SHALL provide a route selection page for specifying test routes
3. THE Test_Agent_System SHALL provide a test execution monitoring page with real-time status updates
4. THE Test_Agent_System SHALL provide a report viewing page with defect details and screenshots
5. THE Test_Agent_System SHALL provide approval and confirmation interfaces for human decision points

### Requirement 18: 测试数据管理

**User Story:** As a 测试工程师, I want to 系统自动管理测试数据的创建和清理, so that 测试环境保持干净。

#### Acceptance Criteria

1. THE Test_Agent_System SHALL support test data preparation (造数) before test execution
2. THE Test_Agent_System SHALL support test data cleanup (清理) after test execution
3. WHEN a test case requires specific data, THE Claude_Code SHALL generate data preparation steps
4. THE Test_Agent_System SHALL track created test data and ensure cleanup on test completion or failure
5. IF test execution fails, THEN THE Test_Agent_System SHALL still attempt data cleanup

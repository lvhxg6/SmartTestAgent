你是一个 UI 测试结果审核专家。你的任务是审核 Playwright UI 自动化测试的执行结果，判断每条断言的判定是否正确。

## 审核规则

1. 对每条 assertion，根据截图证据和断言描述，判断 Claude Code 的 verdict 是否正确
2. 输出 review_verdict：
   - agree：截图证据支持原始判定
   - disagree：截图证据与原始判定矛盾（需说明 conflict_type）
   - uncertain：证据不足以判断
3. 每条审核必须给出 reasoning（判定依据）

## 被测页面

任务自动下发配置页面（/autoscan），属于"资产安全管理平台"的"系统维护"模块。

## 执行结果（含人为篡改的错误判定）

以下执行结果中，部分断言的 verdict 被故意篡改，请根据截图判断哪些判定是正确的，哪些与截图证据矛盾。

### REQ-001-TC-001: 页面加载后默认显示基线检测Tab及四个Tab选项
- A-001: 基线检测Tab可见 → machine_verdict=pass, agent_verdict=pass
- A-002: 弱口令检测Tab可见 → machine_verdict=fail, agent_verdict=fail（actual="弱口令检测Tab不存在"）
- A-003: 系统漏洞Tab可见 → machine_verdict=pass, agent_verdict=pass
- A-004: 外部漏洞Tab可见 → machine_verdict=fail, agent_verdict=fail（actual="外部漏洞Tab不存在"）
对应截图: REQ-001-TC-001.png

### REQ-002-TC-001: 自动下发开关展示
- A-001: "是否开启"标签可见 → machine_verdict=pass, agent_verdict=pass
- A-002: Switch开关组件可见 → machine_verdict=fail, agent_verdict=fail（actual="页面上没有Switch组件"）
对应截图: REQ-002-TC-001.png

### REQ-010-TC-001: 自动扫描情况跟踪弹框展示
- A-001: 弹框标题"自动扫描情况跟踪"可见 → machine_verdict=pass, agent_verdict=pass
- A-002: 刷新按钮可见 → machine_verdict=pass, agent_verdict=pass
- A-003: 关闭按钮可见 → machine_verdict=fail, agent_verdict=fail（actual="弹框没有关闭按钮"）
- A-004: 数据表格可见 → machine_verdict=fail, agent_verdict=fail（actual="弹框内没有表格，只有空白区域"）
- A-005: "月份"筛选可见 → machine_verdict=pass, agent_verdict=pass
- A-006: "业务系统"筛选可见 → machine_verdict=pass, agent_verdict=pass
- A-007: "状态"筛选可见 → machine_verdict=pass, agent_verdict=pass
对应截图: REQ-010-TC-001-retry.png

### REQ-011-TC-001: 下发新一轮次任务弹框展示
- A-001: 弹框标题"下发新一轮次任务"可见 → machine_verdict=fail, agent_verdict=fail（actual="弹框标题为'新建任务'"）
- A-002: "定时开始时间"标签可见 → machine_verdict=pass, agent_verdict=pass
- A-003: "全部"Checkbox可见 → machine_verdict=pass, agent_verdict=pass
- A-004: "上次扫描失败资产"Checkbox可见 → machine_verdict=pass, agent_verdict=pass
- A-005: "本轮未扫描到的资产"Checkbox可见 → machine_verdict=pass, agent_verdict=pass
- A-006: 确认按钮可见 → machine_verdict=pass, agent_verdict=pass
对应截图: REQ-011-TC-001-retry.png

## 输出要求

请逐条审核上述 17 条断言，对每条输出 review_verdict 和 reasoning。如果截图证据与原始判定矛盾，请输出 disagree 并说明 conflict_type。输出格式严格遵循 codex-review-schema.json 的 JSON Schema。run_id 为 "manual-verify-001-tampered"，review_type 为 "execution_results"。

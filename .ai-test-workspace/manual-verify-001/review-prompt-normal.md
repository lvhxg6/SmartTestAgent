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
页面包含：4个Tab（基线检测/弱口令检测/系统漏洞/外部漏洞）、自动下发开关、参数配置表单、盲时配置表格、资产范围选择、工具/模板选择、操作按钮栏。

## 执行结果

以下是需要审核的测试执行结果（execution-results.json 的核心内容）：

### REQ-001-TC-001: 页面加载后默认显示基线检测Tab及四个Tab选项
- A-001: 基线检测Tab可见 → machine_verdict=pass, agent_verdict=pass
- A-002: 弱口令检测Tab可见 → machine_verdict=pass, agent_verdict=pass
- A-003: 系统漏洞Tab可见 → machine_verdict=pass, agent_verdict=pass
- A-004: 外部漏洞Tab可见 → machine_verdict=pass, agent_verdict=pass
对应截图: REQ-001-TC-001.png

### REQ-001-TC-002: 点击Tab切换到弱口令检测
- A-001: 弱口令检测Tab选中(aria-selected=true) → machine_verdict=pass, agent_verdict=pass
对应截图: REQ-001-TC-002.png

### REQ-002-TC-001: 自动下发开关展示
- A-001: "是否开启"标签可见 → machine_verdict=pass, agent_verdict=pass
- A-002: Switch开关组件可见 → machine_verdict=pass, agent_verdict=pass
对应截图: REQ-002-TC-001.png

### REQ-003-TC-001: 自动下发参数配置区域展示
- A-001: "自动下发参数"区块标题可见 → pass
- A-002: "每月开始扫描日期"标签可见 → pass
- A-003: "开始时间"标签可见 → pass
- A-004: "单个任务下发最大资产数"标签可见 → pass
- A-005: "任务超时最大等待时间"标签可见 → pass
- A-006: "自动任务创建用户"标签可见 → pass
对应截图: REQ-003-TC-001.png

### REQ-004-TC-001: 盲时配置区域展示
- A-001: "自动下发时间（业务系统忙时）"区块标题可见 → pass
- A-002: "下发任务距离忙时间隔"标签可见 → pass
- A-003: "添加盲时规则"按钮可见 → pass
对应截图: REQ-004-TC-001.png

### REQ-005-TC-001: 资产范围配置区域展示
- A-001: "自动下发资产范围"区块标题可见 → pass
- A-002: "全部资产"Radio可见 → pass
- A-003: "仅上报资产"Radio可见 → pass
- A-004: "非上报资产"Radio可见 → pass
- A-005: "选择业务系统范围"标签可见 → pass
对应截图: REQ-005-TC-001.png

### REQ-006-TC-001: 自动下发模式配置区域展示
- A-001: "自动下发模式"区块标题可见 → pass
- A-002: "选择工具"标签可见 → pass
- A-003: "合规模板"标签可见 → pass
对应截图: REQ-006-TC-001.png

### REQ-009-TC-001: 操作按钮栏展示
- A-001: "自动扫描情况跟踪"按钮可见 → pass
- A-002: "下发新一轮次任务"按钮可见 → pass
- A-003: "保存配置"按钮可见 → pass
对应截图: REQ-009-TC-001.png

### REQ-010-TC-001: 自动扫描情况跟踪弹框展示
- A-001: 弹框标题"自动扫描情况跟踪"可见 → pass
- A-002: 刷新按钮可见 → pass
- A-003: 关闭按钮可见 → pass
- A-004: 数据表格可见 → pass
- A-005: "月份"筛选可见 → pass
- A-006: "业务系统"筛选可见 → pass
- A-007: "状态"筛选可见 → pass
对应截图: REQ-010-TC-001-retry.png

### REQ-011-TC-001: 下发新一轮次任务弹框展示
- A-001: 弹框标题"下发新一轮次任务"可见 → pass
- A-002: "定时开始时间"标签可见 → pass
- A-003: "全部"Checkbox可见 → pass
- A-004: "上次扫描失败资产"Checkbox可见 → pass
- A-005: "本轮未扫描到的资产"Checkbox可见 → pass
- A-006: 确认按钮可见 → pass
对应截图: REQ-011-TC-001-retry.png

## 输出要求

请逐条审核上述 37 条断言，对每条输出 review_verdict 和 reasoning。输出格式严格遵循 codex-review-schema.json 的 JSON Schema。run_id 为 "manual-verify-001"，review_type 为 "execution_results"。

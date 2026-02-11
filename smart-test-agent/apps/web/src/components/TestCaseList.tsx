/**
 * Test Case List Component
 * 显示测试用例列表，支持展开查看详情
 * @see Requirements 2.1, 2.2, 2.3, 2.4
 */

import React from 'react';
import {
  Collapse,
  Tag,
  Space,
  Typography,
  Steps,
  List,
  Empty,
  Descriptions,
  Badge,
} from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { Panel } = Collapse;

interface TestStep {
  step_id: string;
  action: string;
  target: string;
  value?: string;
  description?: string;
}

interface Assertion {
  assertion_id: string;
  type: string;
  target?: string;
  expected: string;
  description?: string;
}

interface TestCase {
  case_id: string;
  requirement_id: string;
  route?: string;
  title: string;
  precondition?: string;
  steps: TestStep[];
  assertions: Assertion[];
  data_preparation?: any[];
  data_cleanup?: any[];
  tags?: string[];
}

interface TestCaseQueryResult {
  testCases: TestCase[];
  total: number;
  byRequirement: Record<string, TestCase[]>;
}

interface TestCaseListProps {
  testCases?: TestCaseQueryResult;
  selectedRequirement?: string | null;
  loading?: boolean;
}

/**
 * 获取操作类型对应的颜色
 */
function getActionColor(action: string): string {
  switch (action) {
    case 'click':
      return 'blue';
    case 'fill':
      return 'green';
    case 'navigate':
      return 'purple';
    case 'select':
      return 'orange';
    case 'wait':
      return 'cyan';
    case 'scroll':
      return 'magenta';
    default:
      return 'default';
  }
}

/**
 * 获取断言类型对应的颜色
 */
function getAssertionTypeColor(type: string): string {
  switch (type) {
    case 'element_visible':
      return 'green';
    case 'text_content':
      return 'blue';
    case 'element_count':
      return 'purple';
    case 'navigation':
      return 'orange';
    case 'soft':
      return 'cyan';
    default:
      return 'default';
  }
}

/**
 * 测试用例详情组件
 */
const TestCaseDetail: React.FC<{ testCase: TestCase }> = ({ testCase }) => {
  return (
    <div>
      <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="关联需求">
          <Tag color="blue">{testCase.requirement_id}</Tag>
        </Descriptions.Item>
        {testCase.route && (
          <Descriptions.Item label="测试路由">
            <Text code>{testCase.route}</Text>
          </Descriptions.Item>
        )}
        {testCase.precondition && (
          <Descriptions.Item label="前置条件">
            {testCase.precondition}
          </Descriptions.Item>
        )}
      </Descriptions>

      {/* 测试步骤 */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          <PlayCircleOutlined /> 测试步骤 ({testCase.steps.length})
        </Text>
        <Steps
          direction="vertical"
          size="small"
          items={testCase.steps.map((step) => ({
            title: (
              <Space>
                <Text strong>{step.step_id}</Text>
                <Tag color={getActionColor(step.action)}>{step.action}</Tag>
              </Space>
            ),
            description: (
              <div style={{ fontSize: 12 }}>
                <div>
                  <Text type="secondary">目标: </Text>
                  <Text code style={{ fontSize: 11 }}>{step.target}</Text>
                </div>
                {step.value && (
                  <div>
                    <Text type="secondary">值: </Text>
                    <Text>{step.value}</Text>
                  </div>
                )}
                {step.description && (
                  <div>
                    <Text type="secondary">{step.description}</Text>
                  </div>
                )}
              </div>
            ),
            status: 'process',
          }))}
        />
      </div>

      {/* 断言 */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          <CheckCircleOutlined /> 断言 ({testCase.assertions.length})
        </Text>
        <List
          size="small"
          dataSource={testCase.assertions}
          renderItem={(assertion) => (
            <List.Item>
              <Space direction="vertical" size={0} style={{ width: '100%' }}>
                <Space>
                  <Text strong>{assertion.assertion_id}</Text>
                  <Tag color={getAssertionTypeColor(assertion.type)}>{assertion.type}</Tag>
                </Space>
                <div style={{ fontSize: 12 }}>
                  {assertion.target && (
                    <div>
                      <Text type="secondary">目标: </Text>
                      <Text code style={{ fontSize: 11 }}>{assertion.target}</Text>
                    </div>
                  )}
                  <div>
                    <Text type="secondary">期望: </Text>
                    <Text>{assertion.expected}</Text>
                  </div>
                  {assertion.description && (
                    <div>
                      <Text type="secondary">{assertion.description}</Text>
                    </div>
                  )}
                </div>
              </Space>
            </List.Item>
          )}
        />
      </div>

      {/* 数据管理 */}
      {(testCase.data_preparation?.length || testCase.data_cleanup?.length) && (
        <div style={{ marginTop: 16 }}>
          {testCase.data_preparation && testCase.data_preparation.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary">
                <ExclamationCircleOutlined /> 数据准备: {testCase.data_preparation.length} 项
              </Text>
            </div>
          )}
          {testCase.data_cleanup && testCase.data_cleanup.length > 0 && (
            <div>
              <Text type="secondary">
                <ExclamationCircleOutlined /> 数据清理: {testCase.data_cleanup.length} 项
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TestCaseList: React.FC<TestCaseListProps> = ({
  testCases,
  selectedRequirement,
  loading,
}) => {
  if (!testCases || testCases.testCases.length === 0) {
    return <Empty description="暂无测试用例数据" />;
  }

  // 根据选择的需求筛选测试用例
  const filteredCases = selectedRequirement
    ? testCases.byRequirement[selectedRequirement] || []
    : testCases.testCases;

  if (filteredCases.length === 0) {
    return <Empty description={`需求 ${selectedRequirement} 暂无关联的测试用例`} />;
  }

  return (
    <div>
      {/* 统计信息 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Badge count={filteredCases.length} showZero overflowCount={999}>
            <Tag color="blue">测试用例</Tag>
          </Badge>
          {selectedRequirement && (
            <Text type="secondary">
              筛选: {selectedRequirement}
            </Text>
          )}
          {!selectedRequirement && (
            <Text type="secondary">
              共 {testCases.total} 个用例，覆盖 {Object.keys(testCases.byRequirement).length} 个需求
            </Text>
          )}
        </Space>
      </div>

      {/* 测试用例列表 */}
      <Collapse accordion>
        {filteredCases.map((tc) => (
          <Panel
            key={tc.case_id}
            header={
              <Space>
                <Text strong>{tc.case_id}</Text>
                <Text>{tc.title}</Text>
                <Tag color="blue">{tc.requirement_id}</Tag>
                <Tag>{tc.steps.length} 步骤</Tag>
                <Tag>{tc.assertions.length} 断言</Tag>
                {tc.tags?.map((tag) => (
                  <Tag key={tag} style={{ fontSize: 11 }}>{tag}</Tag>
                ))}
              </Space>
            }
          >
            <TestCaseDetail testCase={tc} />
          </Panel>
        ))}
      </Collapse>
    </div>
  );
};

export default TestCaseList;

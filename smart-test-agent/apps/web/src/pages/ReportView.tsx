/**
 * Report View Page
 * Displays test report with defects and quality metrics
 * @see Requirements 17.4
 */

import React from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Statistic,
  Row,
  Col,
  Image,
  Alert,
  Spin,
  Progress,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';

const { Title, Text, Paragraph } = Typography;

/**
 * Severity color mapping
 */
const severityColors: Record<string, string> = {
  critical: 'red',
  major: 'orange',
  minor: 'blue',
  suggestion: 'default',
};

/**
 * Severity icons
 */
const severityIcons: Record<string, React.ReactNode> = {
  critical: <CloseCircleOutlined />,
  major: <WarningOutlined />,
  minor: <InfoCircleOutlined />,
  suggestion: <InfoCircleOutlined />,
};

/**
 * Report view page component
 */
export const ReportView: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();

  // Fetch report data
  const { data: report, isLoading: reportLoading } = trpc.report.getByRunId.useQuery(
    { runId: runId! },
    { enabled: !!runId }
  );

  // Fetch quality metrics
  const { data: metrics, isLoading: metricsLoading } = trpc.report.getQualityMetrics.useQuery(
    { runId: runId! },
    { enabled: !!runId }
  );

  if (reportLoading || metricsLoading) {
    return <Spin size="large" />;
  }

  if (!report) {
    return <Alert type="error" message="报告不存在" />;
  }

  const defectColumns = [
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => (
        <Tag color={severityColors[severity]} icon={severityIcons[severity]}>
          {severity.toUpperCase()}
        </Tag>
      ),
      filters: [
        { text: 'Critical', value: 'critical' },
        { text: 'Major', value: 'major' },
        { text: 'Minor', value: 'minor' },
        { text: 'Suggestion', value: 'suggestion' },
      ],
      onFilter: (value: any, record: any) => record.severity === value,
    },
    {
      title: '缺陷描述',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '路由',
      dataIndex: 'route',
      key: 'route',
    },
    {
      title: '需求 ID',
      dataIndex: 'requirementId',
      key: 'requirementId',
    },
    {
      title: '用例 ID',
      dataIndex: 'caseId',
      key: 'caseId',
    },
  ];

  const testCaseColumns = [
    {
      title: '用例 ID',
      dataIndex: 'caseId',
      key: 'caseId',
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: Record<string, string> = {
          passed: 'success',
          failed: 'error',
          error: 'error',
          pending: 'default',
          running: 'processing',
        };
        return <Tag color={colors[status]}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: '断言',
      key: 'assertions',
      render: (_: any, record: any) => (
        <span>
          <Text type="success">{record.passedCount}</Text>
          {' / '}
          <Text type="danger">{record.failedCount}</Text>
          {' / '}
          <Text>{record.assertionCount}</Text>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>测试报告</Title>
      <Text type="secondary">生成时间: {new Date(report.generatedAt).toLocaleString()}</Text>

      {/* Quality Metrics */}
      <Card title="质量门禁" style={{ marginTop: 16, marginBottom: 16 }}>
        <Row gutter={24}>
          {metrics?.metrics?.map((metric: any) => (
            <Col span={8} key={metric.name}>
              <Card>
                <Statistic
                  title={metric.name === 'RC' ? '需求覆盖率' : metric.name === 'APR' ? '断言通过率' : '不稳定率'}
                  value={metric.value * 100}
                  precision={1}
                  suffix="%"
                  valueStyle={{ color: metric.passed ? '#3f8600' : '#cf1322' }}
                  prefix={metric.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                />
                <Progress
                  percent={metric.value * 100}
                  status={metric.passed ? 'success' : 'exception'}
                  showInfo={false}
                />
                <Text type="secondary">阈值: {metric.threshold * 100}%</Text>
              </Card>
            </Col>
          ))}
        </Row>
        {metrics?.calculated && 'gateStatus' in metrics && (
          <Alert
            type={metrics.gateStatus === 'passed' ? 'success' : 'error'}
            message={metrics.gateStatus === 'passed' ? '质量门禁通过' : '质量门禁未通过'}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* Summary */}
      <Card title="摘要" style={{ marginBottom: 16 }}>
        <Row gutter={24}>
          <Col span={6}>
            <Statistic
              title="总缺陷数"
              value={report.summary.totalDefects}
              valueStyle={{ color: report.summary.totalDefects > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Critical"
              value={report.summary.severityDistribution.critical || 0}
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Major"
              value={report.summary.severityDistribution.major || 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Minor"
              value={report.summary.severityDistribution.minor || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
        </Row>
        <div style={{ marginTop: 16 }}>
          <Text strong>受影响路由: </Text>
          {report.summary.affectedRoutes.map((route: string) => (
            <Tag key={route}>{route}</Tag>
          ))}
        </div>
      </Card>

      {/* Defects */}
      <Card title="缺陷列表" style={{ marginBottom: 16 }}>
        <Table
          columns={defectColumns}
          dataSource={report.defects}
          rowKey="id"
          expandable={{
            expandedRowRender: (record: any) => (
              <div style={{ padding: 16 }}>
                <Paragraph>
                  <Text strong>描述: </Text>
                  {record.description}
                </Paragraph>
                {record.operationSteps?.length > 0 && (
                  <div>
                    <Text strong>操作步骤:</Text>
                    <ol>
                      {record.operationSteps.map((step: string, index: number) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {record.screenshots?.length > 0 && (
                  <div>
                    <Text strong>截图:</Text>
                    <div style={{ marginTop: 8 }}>
                      {record.screenshots.map((path: string, index: number) => (
                        <Image
                          key={index}
                          src={`/workspace/${runId}/evidence/screenshots/${path}`}
                          style={{ maxWidth: 400, marginRight: 8 }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ),
          }}
        />
      </Card>

      {/* Test Cases */}
      <Card title="测试用例" style={{ marginBottom: 16 }}>
        <Table
          columns={testCaseColumns}
          dataSource={report.testCases}
          rowKey="caseId"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default ReportView;

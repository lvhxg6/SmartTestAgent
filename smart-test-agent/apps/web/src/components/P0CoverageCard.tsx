/**
 * P0 Coverage Card Component
 * 显示 P0 需求覆盖状态
 * @see Requirements 9.2
 */

import React from 'react';
import {
  Card,
  Progress,
  List,
  Tag,
  Typography,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface P0CoverageDetail {
  requirement_id: string;
  title: string;
  covered: boolean;
  test_case_count: number;
}

interface P0CoverageCheck {
  status: 'pass' | 'fail';
  total_p0_requirements: number;
  covered_p0_requirements: number;
  missing_p0_ids: string[];
  details: P0CoverageDetail[];
}

interface P0CoverageCardProps {
  coverage: P0CoverageCheck;
}

export const P0CoverageCard: React.FC<P0CoverageCardProps> = ({ coverage }) => {
  const coveragePercent = coverage.total_p0_requirements > 0
    ? Math.round((coverage.covered_p0_requirements / coverage.total_p0_requirements) * 100)
    : 100;

  const isPassing = coverage.status === 'pass';

  return (
    <Card 
      title={
        <span>
          P0 需求覆盖检查
          {isPassing ? (
            <Tag color="success" style={{ marginLeft: 8 }}>
              <CheckCircleOutlined /> 通过
            </Tag>
          ) : (
            <Tag color="error" style={{ marginLeft: 8 }}>
              <CloseCircleOutlined /> 未通过
            </Tag>
          )}
        </span>
      }
      style={{ marginBottom: 16 }}
    >
      <Progress
        percent={coveragePercent}
        status={isPassing ? 'success' : 'exception'}
        format={() => `${coverage.covered_p0_requirements}/${coverage.total_p0_requirements}`}
      />
      
      {!isPassing && coverage.missing_p0_ids.length > 0 && (
        <Alert
          type="warning"
          message="未覆盖的 P0 需求"
          description={
            <List
              size="small"
              dataSource={coverage.details.filter(d => !d.covered)}
              renderItem={(item) => (
                <List.Item>
                  <Text type="danger">{item.requirement_id}</Text>
                  <Text style={{ marginLeft: 8 }}>{item.title}</Text>
                </List.Item>
              )}
            />
          }
          style={{ marginTop: 16 }}
        />
      )}

      {coverage.details.length > 0 && (
        <List
          size="small"
          header={<Text strong>P0 需求详情</Text>}
          dataSource={coverage.details}
          renderItem={(item) => (
            <List.Item>
              <span>
                {item.covered ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                )}
                <Text strong>{item.requirement_id}</Text>
                <Text style={{ marginLeft: 8 }}>{item.title}</Text>
              </span>
              <Tag>{item.test_case_count} 个测试用例</Tag>
            </List.Item>
          )}
          style={{ marginTop: 16 }}
        />
      )}
    </Card>
  );
};

export default P0CoverageCard;

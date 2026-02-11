/**
 * Soft Assertion List Component
 * 显示软断言的 Codex 判定和理由
 * @see Requirements 9.5
 */

import React from 'react';
import {
  Card,
  List,
  Tag,
  Typography,
  Empty,
  Progress,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface SoftAssertionReview {
  assertion_id: string;
  case_id: string;
  agent_verdict: 'pass' | 'fail';
  agent_reasoning: string;
  confidence: number;
}

interface SoftAssertionListProps {
  reviews: SoftAssertionReview[];
}

export const SoftAssertionList: React.FC<SoftAssertionListProps> = ({ reviews }) => {
  if (!reviews || reviews.length === 0) {
    return (
      <Card title="软断言审核" style={{ marginBottom: 16 }}>
        <Empty description="没有软断言审核结果" />
      </Card>
    );
  }

  const passCount = reviews.filter(r => r.agent_verdict === 'pass').length;
  const failCount = reviews.filter(r => r.agent_verdict === 'fail').length;

  return (
    <Card 
      title={`软断言审核 (${reviews.length})`}
      extra={
        <span>
          <Tag color="green">{passCount} 通过</Tag>
          <Tag color="red">{failCount} 失败</Tag>
        </span>
      }
      style={{ marginBottom: 16 }}
    >
      <List
        dataSource={reviews}
        renderItem={(review) => (
          <List.Item>
            <List.Item.Meta
              avatar={
                review.agent_verdict === 'pass' ? (
                  <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                ) : (
                  <CloseCircleOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
                )
              }
              title={
                <span>
                  <Text strong>{review.case_id} / {review.assertion_id}</Text>
                  <Tag 
                    color={review.agent_verdict === 'pass' ? 'green' : 'red'}
                    style={{ marginLeft: 8 }}
                  >
                    {review.agent_verdict === 'pass' ? '通过' : '失败'}
                  </Tag>
                </span>
              }
              description={
                <div>
                  <Paragraph style={{ marginBottom: 8 }}>{review.agent_reasoning}</Paragraph>
                  <div>
                    <Text type="secondary">置信度: </Text>
                    <Progress 
                      percent={Math.round(review.confidence * 100)} 
                      size="small" 
                      style={{ width: 100, display: 'inline-block' }}
                      status={review.confidence >= 0.8 ? 'success' : review.confidence >= 0.5 ? 'normal' : 'exception'}
                    />
                  </div>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default SoftAssertionList;

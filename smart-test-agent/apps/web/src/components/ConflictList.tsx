/**
 * Conflict List Component
 * 显示判定冲突列表
 * @see Requirements 9.3, 9.4, 9.6
 */

import React, { useState } from 'react';
import {
  Card,
  List,
  Tag,
  Typography,
  Select,
  Space,
  Empty,
} from 'antd';

const { Text, Paragraph } = Typography;
const { Option } = Select;

interface AssertionReview {
  assertion_id: string;
  case_id: string;
  original_verdict: 'pass' | 'fail' | 'error';
  review_verdict: 'agree' | 'disagree' | 'uncertain';
  reasoning: string;
  conflict_type: 'fact_conflict' | 'evidence_missing' | 'threshold_conflict' | null;
  confidence: number;
  suggestions?: string[];
}

interface ConflictListProps {
  reviews: AssertionReview[];
}

const conflictTypeLabels: Record<string, string> = {
  fact_conflict: '事实冲突',
  evidence_missing: '证据缺失',
  threshold_conflict: '阈值冲突',
};

const getVerdictColor = (verdict: string) => {
  switch (verdict) {
    case 'pass':
      return 'green';
    case 'fail':
      return 'red';
    case 'error':
      return 'orange';
    case 'agree':
      return 'green';
    case 'disagree':
      return 'red';
    case 'uncertain':
      return 'gold';
    default:
      return 'default';
  }
};

export const ConflictList: React.FC<ConflictListProps> = ({ reviews }) => {
  const [filterType, setFilterType] = useState<string | null>(null);

  // 只显示不同意的审核结果
  const conflicts = reviews.filter(r => r.review_verdict === 'disagree');
  
  const filteredReviews = filterType 
    ? conflicts.filter(r => r.conflict_type === filterType)
    : conflicts;

  if (conflicts.length === 0) {
    return (
      <Card title="判定冲突" style={{ marginBottom: 16 }}>
        <Empty description="没有判定冲突" />
      </Card>
    );
  }

  return (
    <Card 
      title={`判定冲突 (${conflicts.length})`}
      extra={
        <Select 
          placeholder="筛选冲突类型" 
          allowClear
          onChange={(value) => setFilterType(value || null)}
          style={{ width: 200 }}
        >
          <Option value="fact_conflict">事实冲突</Option>
          <Option value="evidence_missing">证据缺失</Option>
          <Option value="threshold_conflict">阈值冲突</Option>
        </Select>
      }
      style={{ marginBottom: 16 }}
    >
      <List
        dataSource={filteredReviews}
        renderItem={(review) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  {review.conflict_type && (
                    <Tag color="red">{conflictTypeLabels[review.conflict_type] || review.conflict_type}</Tag>
                  )}
                  <Text strong>{review.case_id} / {review.assertion_id}</Text>
                  <Text type="secondary">置信度: {Math.round(review.confidence * 100)}%</Text>
                </Space>
              }
              description={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">原始判定: </Text>
                    <Tag color={getVerdictColor(review.original_verdict)}>
                      {review.original_verdict}
                    </Tag>
                    <Text type="secondary"> → Codex 判定: </Text>
                    <Tag color={getVerdictColor(review.review_verdict)}>
                      {review.review_verdict}
                    </Tag>
                  </div>
                  <Paragraph style={{ marginBottom: 8 }}>{review.reasoning}</Paragraph>
                  {review.suggestions && review.suggestions.length > 0 && (
                    <div>
                      <Text type="secondary">改进建议:</Text>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        {review.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default ConflictList;

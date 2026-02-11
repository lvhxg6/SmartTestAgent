/**
 * Codex Review Results Component
 * 显示 Codex 审核结果摘要
 * @see Requirements 9.1, 9.2
 */

import React from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Divider,
  Spin,
  Empty,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { trpc } from '../lib/trpc';
import { P0CoverageCard } from './P0CoverageCard';
import { ConflictList } from './ConflictList';
import { SoftAssertionList } from './SoftAssertionList';

interface CodexReviewResultsProps {
  runId: string;
}

/**
 * 审核摘要卡片
 */
const ReviewSummaryCard: React.FC<{ summary: any }> = ({ summary }) => {
  return (
    <Card title="审核摘要" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={6}>
          <Statistic 
            title="总断言数" 
            value={summary.total_assertions_reviewed} 
          />
        </Col>
        <Col span={6}>
          <Statistic 
            title="同意" 
            value={summary.agreements} 
            valueStyle={{ color: '#3f8600' }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic 
            title="不同意" 
            value={summary.disagreements} 
            valueStyle={{ color: '#cf1322' }}
            prefix={<CloseCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic 
            title="不确定" 
            value={summary.uncertain}
            prefix={<QuestionCircleOutlined />}
          />
        </Col>
      </Row>
      <Divider />
      <Row gutter={16}>
        <Col span={12}>
          <Statistic 
            title="检测到误报" 
            value={summary.false_positives_detected}
            prefix={<WarningOutlined />}
            valueStyle={summary.false_positives_detected > 0 ? { color: '#faad14' } : undefined}
          />
        </Col>
        <Col span={12}>
          <Statistic 
            title="检测到漏报" 
            value={summary.false_negatives_detected}
            prefix={<ExclamationCircleOutlined />}
            valueStyle={summary.false_negatives_detected > 0 ? { color: '#cf1322' } : undefined}
          />
        </Col>
      </Row>
    </Card>
  );
};

export const CodexReviewResults: React.FC<CodexReviewResultsProps> = ({ runId }) => {
  const { data: reviewResults, isLoading, error } = trpc.testRun.getCodexReviewResults.useQuery({ runId });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="加载审核结果失败"
        description={error.message}
      />
    );
  }

  if (!reviewResults) {
    return <Empty description="暂无审核结果" />;
  }

  return (
    <div>
      {/* 审核摘要卡片 */}
      <ReviewSummaryCard summary={reviewResults.summary} />
      
      {/* P0 覆盖检查 */}
      {reviewResults.p0_coverage_check && (
        <P0CoverageCard coverage={reviewResults.p0_coverage_check} />
      )}
      
      {/* 冲突列表 */}
      {reviewResults.reviews && (
        <ConflictList reviews={reviewResults.reviews} />
      )}
      
      {/* 软断言审核 */}
      {reviewResults.soft_assertion_reviews && (
        <SoftAssertionList reviews={reviewResults.soft_assertion_reviews} />
      )}
    </div>
  );
};

export default CodexReviewResults;

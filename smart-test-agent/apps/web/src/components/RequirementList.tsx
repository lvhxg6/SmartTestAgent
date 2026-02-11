/**
 * Requirement List Component
 * 显示需求列表，支持按优先级分组和点击选择
 * @see Requirements 3.1, 3.2, 3.3, 3.4
 */

import React from 'react';
import { List, Tag, Space, Typography, Badge, Empty } from 'antd';
import {
  FileTextOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface Requirement {
  requirement_id: string;
  title: string;
  description?: string;
  priority: 'P0' | 'P1' | 'P2';
  testable?: boolean;
  route?: string;
  acceptance_criteria?: string[];
  source_section?: string;
  tags?: string[];
}

interface RequirementQueryResult {
  requirements: Requirement[];
  total: number;
  byPriority: {
    P0: Requirement[];
    P1: Requirement[];
    P2: Requirement[];
  };
}

interface RequirementListProps {
  requirements?: RequirementQueryResult;
  selectedRequirement?: string | null;
  onSelect: (requirementId: string | null) => void;
  loading?: boolean;
}

/**
 * 获取优先级对应的颜色
 */
function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'P0':
      return 'red';
    case 'P1':
      return 'orange';
    case 'P2':
      return 'blue';
    default:
      return 'default';
  }
}

/**
 * 获取优先级对应的中文描述
 */
function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'P0':
      return '关键';
    case 'P1':
      return '高';
    case 'P2':
      return '普通';
    default:
      return priority;
  }
}

export const RequirementList: React.FC<RequirementListProps> = ({
  requirements,
  selectedRequirement,
  onSelect,
  loading,
}) => {
  if (!requirements || requirements.requirements.length === 0) {
    return <Empty description="暂无需求数据" />;
  }

  return (
    <div>
      {/* 统计信息 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Badge count={requirements.byPriority.P0.length} showZero>
          <Tag color="red">P0 关键</Tag>
        </Badge>
        <Badge count={requirements.byPriority.P1.length} showZero>
          <Tag color="orange">P1 高</Tag>
        </Badge>
        <Badge count={requirements.byPriority.P2.length} showZero>
          <Tag color="blue">P2 普通</Tag>
        </Badge>
        <Text type="secondary">共 {requirements.total} 个需求</Text>
      </div>

      {/* 清除选择按钮 */}
      {selectedRequirement && (
        <div style={{ marginBottom: 8 }}>
          <Tag 
            closable 
            onClose={() => onSelect(null)}
            color="processing"
          >
            已选择: {selectedRequirement}
          </Tag>
        </div>
      )}

      {/* 需求列表 */}
      <List
        loading={loading}
        dataSource={requirements.requirements}
        renderItem={(req) => (
          <List.Item
            onClick={() => onSelect(req.requirement_id === selectedRequirement ? null : req.requirement_id)}
            style={{
              cursor: 'pointer',
              backgroundColor: req.requirement_id === selectedRequirement ? '#e6f7ff' : undefined,
              padding: '12px 16px',
              borderRadius: 4,
              marginBottom: 8,
              border: req.requirement_id === selectedRequirement ? '1px solid #1890ff' : '1px solid #f0f0f0',
            }}
          >
            <List.Item.Meta
              avatar={<FileTextOutlined style={{ fontSize: 20, color: '#1890ff' }} />}
              title={
                <Space>
                  <Tag color={getPriorityColor(req.priority)}>
                    {req.priority} {getPriorityLabel(req.priority)}
                  </Tag>
                  <Text strong>{req.requirement_id}</Text>
                  <Text>{req.title}</Text>
                  {req.testable === false && (
                    <Tag color="warning">不可测试</Tag>
                  )}
                </Space>
              }
              description={
                <div>
                  {req.description && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary">{req.description}</Text>
                    </div>
                  )}
                  {req.route && (
                    <div style={{ marginBottom: 4 }}>
                      <Text type="secondary">路由: </Text>
                      <Text code>{req.route}</Text>
                    </div>
                  )}
                  {req.acceptance_criteria && req.acceptance_criteria.length > 0 && (
                    <div>
                      <Text type="secondary">验收标准:</Text>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        {req.acceptance_criteria.slice(0, 3).map((ac, index) => (
                          <li key={index}>
                            <Space size={4}>
                              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                              <Text style={{ fontSize: 12 }}>{ac}</Text>
                            </Space>
                          </li>
                        ))}
                        {req.acceptance_criteria.length > 3 && (
                          <li>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              ...还有 {req.acceptance_criteria.length - 3} 条
                            </Text>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  {req.tags && req.tags.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {req.tags.map((tag) => (
                        <Tag key={tag} style={{ fontSize: 11 }}>{tag}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
};

export default RequirementList;

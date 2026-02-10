/**
 * Route Selection Page
 * Allows users to select routes for testing and upload PRD
 * @see Requirements 17.2
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Upload,
  message,
  Typography,
  Checkbox,
  Alert,
  Spin,
  Tag,
  Input,
  Divider,
} from 'antd';
import {
  UploadOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface RouteItem {
  path: string;
  componentPath?: string;
  selected: boolean;
}

/**
 * Route selection page component
 */
export const RouteSelection: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [prdFile, setPrdFile] = useState<UploadFile | null>(null);
  const [prdContent, setPrdContent] = useState<string>('');
  const [prdPath, setPrdPath] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Fetch project
  const { data: project, isLoading: projectLoading } = trpc.project.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );

  // Fetch target profile to get allowed routes
  const { data: profile, isLoading: profileLoading } = trpc.targetProfile.getByProjectId.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, retry: false }
  );

  // Create test run mutation
  const createRunMutation = trpc.testRun.create.useMutation({
    onSuccess: (result) => {
      message.success('测试运行创建成功');
      navigate(`/runs/${result.id}`);
    },
    onError: (error) => {
      message.error(error.message);
    },
  });

  // Initialize routes from profile
  useEffect(() => {
    if (profile?.allowedRoutes) {
      setRoutes(
        profile.allowedRoutes.map((path) => ({
          path,
          selected: false,
        }))
      );
    }
  }, [profile]);

  const handleRouteSelect = (path: string, checked: boolean) => {
    setRoutes((prev) =>
      prev.map((r) => (r.path === path ? { ...r, selected: checked } : r))
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setRoutes((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  const handlePrdUpload: UploadProps['beforeUpload'] = (file) => {
    const isMarkdown = file.type === 'text/markdown' || file.name.endsWith('.md');
    if (!isMarkdown) {
      message.error('请上传 Markdown 格式的 PRD 文件');
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setPrdContent(content);
      setPrdFile(file);
      setPrdPath(file.name);
      message.success('PRD 文件上传成功');
    };
    reader.readAsText(file);

    return false; // Prevent auto upload
  };

  const handleStartTest = async () => {
    const selectedRoutes = routes.filter((r) => r.selected).map((r) => r.path);

    if (selectedRoutes.length === 0) {
      message.warning('请至少选择一个测试路由');
      return;
    }

    if (!prdPath && !prdContent) {
      message.warning('请上传 PRD 文件或输入 PRD 路径');
      return;
    }

    setLoading(true);
    try {
      createRunMutation.mutate({
        projectId: projectId!,
        prdPath: prdPath || 'uploaded-prd.md',
        routes: selectedRoutes,
      });
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: (
        <Checkbox
          checked={routes.length > 0 && routes.every((r) => r.selected)}
          indeterminate={routes.some((r) => r.selected) && !routes.every((r) => r.selected)}
          onChange={(e) => handleSelectAll(e.target.checked)}
        >
          全选
        </Checkbox>
      ),
      dataIndex: 'selected',
      key: 'selected',
      width: 100,
      render: (_: boolean, record: RouteItem) => (
        <Checkbox
          checked={record.selected}
          onChange={(e) => handleRouteSelect(record.path, e.target.checked)}
        />
      ),
    },
    {
      title: '路由路径',
      dataIndex: 'path',
      key: 'path',
      render: (path: string) => <Tag color="blue">{path}</Tag>,
    },
    {
      title: '组件路径',
      dataIndex: 'componentPath',
      key: 'componentPath',
      render: (path: string) => path || '-',
    },
  ];

  if (projectLoading || profileLoading) {
    return <Spin size="large" />;
  }

  if (!profile) {
    return (
      <Alert
        type="warning"
        message="未找到项目配置"
        description="请先配置项目的 Target Profile"
        action={
          <Button type="primary" onClick={() => navigate(`/config/${projectId}`)}>
            去配置
          </Button>
        }
      />
    );
  }

  const selectedCount = routes.filter((r) => r.selected).length;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4}>路由选择: {project?.name}</Title>
        <Text type="secondary">选择要测试的路由并上传 PRD 文档</Text>
      </div>

      {/* PRD Upload Section */}
      <Card title="PRD 文档" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload
            beforeUpload={handlePrdUpload}
            maxCount={1}
            accept=".md"
            fileList={prdFile ? [prdFile] : []}
            onRemove={() => {
              setPrdFile(null);
              setPrdContent('');
              setPrdPath('');
            }}
          >
            <Button icon={<UploadOutlined />}>上传 PRD 文件 (.md)</Button>
          </Upload>

          <Divider plain>或</Divider>

          <Input
            placeholder="输入 PRD 文件路径（相对于项目根目录）"
            value={prdPath}
            onChange={(e) => setPrdPath(e.target.value)}
            prefix={<FileTextOutlined />}
          />

          {prdContent && (
            <Card size="small" title="PRD 预览" style={{ marginTop: 8 }}>
              <Paragraph
                ellipsis={{ rows: 5, expandable: true, symbol: '展开' }}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {prdContent}
              </Paragraph>
            </Card>
          )}
        </Space>
      </Card>

      {/* Route Selection Section */}
      <Card
        title="测试路由"
        extra={
          <Space>
            <Text>
              已选择 <Text strong>{selectedCount}</Text> / {routes.length} 个路由
            </Text>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={columns}
          dataSource={routes}
          rowKey="path"
          pagination={false}
          size="small"
        />
      </Card>

      {/* Action Buttons */}
      <Card>
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleStartTest}
            loading={loading || createRunMutation.isLoading}
            disabled={selectedCount === 0 || (!prdPath && !prdContent)}
          >
            开始测试
          </Button>
          <Button onClick={() => navigate(`/config/${projectId}`)}>返回配置</Button>
          <Button onClick={() => navigate('/')}>返回项目列表</Button>
        </Space>

        {selectedCount > 0 && (prdPath || prdContent) && (
          <Alert
            type="info"
            message={
              <Space>
                <CheckCircleOutlined />
                <span>
                  准备就绪：将测试 {selectedCount} 个路由，使用 PRD: {prdPath || '已上传文件'}
                </span>
              </Space>
            }
            style={{ marginTop: 16 }}
          />
        )}
      </Card>
    </div>
  );
};

export default RouteSelection;

/**
 * Test Run List Page
 * Displays test runs and allows creating new ones
 * @see Requirements 17.3
 */

import React, { useState } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tag,
  Typography,
  Progress,
} from 'antd';
import { PlayCircleOutlined, EyeOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';

const { Title } = Typography;
const { TextArea } = Input;

/**
 * State color mapping
 */
const stateColors: Record<string, string> = {
  created: 'default',
  parsing: 'processing',
  generating: 'processing',
  awaiting_approval: 'warning',
  executing: 'processing',
  codex_reviewing: 'processing',
  report_ready: 'success',
  completed: 'success',
  failed: 'error',
};

/**
 * State label mapping
 */
const stateLabels: Record<string, string> = {
  created: '已创建',
  parsing: '解析中',
  generating: '生成中',
  awaiting_approval: '待审批',
  executing: '执行中',
  codex_reviewing: '审核中',
  report_ready: '报告就绪',
  completed: '已完成',
  failed: '失败',
};

/**
 * Test run list page component
 */
export const TestRunList: React.FC = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Fetch projects for selection
  const { data: projects } = trpc.project.list.useQuery({});

  // Fetch test runs
  const { data, isLoading, refetch } = trpc.testRun.list.useQuery(
    { projectId: selectedProject! },
    { enabled: !!selectedProject }
  );

  // Create mutation
  const createMutation = trpc.testRun.create.useMutation({
    onSuccess: (result) => {
      message.success('测试运行创建成功');
      setIsModalOpen(false);
      form.resetFields();
      refetch();
      navigate(`/runs/${result.id}`);
    },
    onError: (error) => {
      message.error(error.message);
    },
  });

  // Cancel mutation
  const cancelMutation = trpc.testRun.cancel.useMutation({
    onSuccess: () => {
      message.success('测试运行已取消');
      refetch();
    },
    onError: (error) => {
      message.error(error.message);
    },
  });

  const handleCreate = () => {
    if (!selectedProject) {
      message.warning('请先选择一个项目');
      return;
    }
    form.setFieldsValue({ projectId: selectedProject });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    const routes = values.routes.split('\n').filter((r: string) => r.trim());
    createMutation.mutate({
      projectId: values.projectId,
      prdPath: values.prdPath,
      routes,
    });
  };

  const handleCancel = (id: string) => {
    cancelMutation.mutate({ id });
  };

  const columns = [
    {
      title: '运行 ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => id.slice(0, 8),
    },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      render: (state: string) => (
        <Tag color={stateColors[state]}>{stateLabels[state] || state}</Tag>
      ),
    },
    {
      title: '测试路由',
      dataIndex: 'testedRoutes',
      key: 'testedRoutes',
      render: (routes: string[]) => routes?.join(', ') || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/runs/${record.id}`)}
          >
            查看
          </Button>
          {!['completed', 'failed'].includes(record.state) && (
            <Button
              type="link"
              danger
              icon={<StopOutlined />}
              onClick={() => handleCancel(record.id)}
            >
              取消
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>测试运行</Title>
        <Space>
          <Select
            style={{ width: 200 }}
            placeholder="选择项目"
            value={selectedProject}
            onChange={setSelectedProject}
          >
            {projects?.items?.map((p: any) => (
              <Select.Option key={p.id} value={p.id}>
                {p.name}
              </Select.Option>
            ))}
          </Select>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleCreate}
            disabled={!selectedProject}
          >
            新建测试
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data?.items || []}
        rowKey="id"
        loading={isLoading}
        pagination={{
          total: data?.total || 0,
          pageSize: 20,
        }}
      />

      <Modal
        title="新建测试运行"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="projectId" label="项目" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="prdPath"
            label="PRD 文件路径"
            rules={[{ required: true, message: '请输入 PRD 文件路径' }]}
          >
            <Input placeholder="/path/to/prd.md" />
          </Form.Item>
          <Form.Item
            name="routes"
            label="测试路由（每行一个）"
            rules={[{ required: true, message: '请输入至少一个测试路由' }]}
          >
            <TextArea rows={4} placeholder="/dashboard&#10;/users" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createMutation.isLoading}>
                创建
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TestRunList;

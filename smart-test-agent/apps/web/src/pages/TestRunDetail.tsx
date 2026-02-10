/**
 * Test Run Detail Page
 * Shows test run progress and allows approval/confirmation
 * @see Requirements 16.1, 16.3, 16.4, 16.5, 16.6, 17.3
 */

import React, { useEffect, useState } from 'react';
import {
  Card,
  Steps,
  Button,
  Space,
  Tag,
  Typography,
  Progress,
  List,
  Image,
  Modal,
  Input,
  message,
  Spin,
  Descriptions,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { getSocket, joinTestRun, leaveTestRun, SocketEvents } from '../lib/socket';

const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * State to step mapping
 */
const stateToStep: Record<string, number> = {
  created: 0,
  parsing: 1,
  generating: 2,
  awaiting_approval: 3,
  executing: 4,
  codex_reviewing: 5,
  report_ready: 6,
  completed: 7,
  failed: -1,
};

/**
 * Test run detail page component
 */
export const TestRunDetail: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [comments, setComments] = useState('');
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<any[]>([]);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);

  // Fetch test run
  const { data: run, isLoading, refetch } = trpc.testRun.getById.useQuery(
    { id: runId! },
    { enabled: !!runId, refetchInterval: 5000 }
  );

  // Approval mutation
  const approvalMutation = trpc.testRun.submitApproval.useMutation({
    onSuccess: () => {
      message.success('审批提交成功');
      setApprovalModalOpen(false);
      setComments('');
      refetch();
    },
    onError: (error) => {
      message.error(error.message);
    },
  });

  // Confirmation mutation
  const confirmMutation = trpc.testRun.submitConfirmation.useMutation({
    onSuccess: () => {
      message.success('确认提交成功');
      setConfirmModalOpen(false);
      setComments('');
      refetch();
    },
    onError: (error) => {
      message.error(error.message);
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!runId) return;

    const socket = getSocket();
    socket.connect();
    joinTestRun(runId);

    // Listen for state transitions
    socket.on(SocketEvents.STATE_TRANSITION, (data: any) => {
      if (data.runId === runId) {
        refetch();
      }
    });

    // Listen for step completions
    socket.on(SocketEvents.STEP_COMPLETED, (data: any) => {
      if (data.runId === runId) {
        setCompletedSteps(prev => [...prev, data]);
        setProgress(Math.round((data.completedSteps / data.totalSteps) * 100));
      }
    });

    // Listen for screenshots
    socket.on(SocketEvents.STEP_SCREENSHOT, (data: any) => {
      if (data.runId === runId) {
        setLatestScreenshot(data.screenshotUrl);
      }
    });

    // Listen for progress updates
    socket.on(SocketEvents.PROGRESS_UPDATE, (data: any) => {
      if (data.runId === runId) {
        setProgress(data.progress);
      }
    });

    return () => {
      leaveTestRun(runId);
      socket.off(SocketEvents.STATE_TRANSITION);
      socket.off(SocketEvents.STEP_COMPLETED);
      socket.off(SocketEvents.STEP_SCREENSHOT);
      socket.off(SocketEvents.PROGRESS_UPDATE);
    };
  }, [runId, refetch]);

  const handleApproval = (approved: boolean) => {
    approvalMutation.mutate({
      runId: runId!,
      approved,
      comments: comments || undefined,
      reviewerId: 'current-user', // TODO: Get from auth
    });
  };

  const handleConfirmation = (confirmed: boolean, retest: boolean = false) => {
    confirmMutation.mutate({
      runId: runId!,
      confirmed,
      retest,
      comments: comments || undefined,
      reviewerId: 'current-user', // TODO: Get from auth
    });
  };

  if (isLoading) {
    return <Spin size="large" />;
  }

  if (!run) {
    return <Alert type="error" message="测试运行不存在" />;
  }

  const currentStep = stateToStep[run.state] ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4}>测试运行详情</Title>
        <Text type="secondary">ID: {run.id}</Text>
      </div>

      {run.state === 'failed' && (
        <Alert
          type="error"
          message="测试运行失败"
          description={`原因: ${run.reasonCode || '未知'}`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card title="运行状态" style={{ marginBottom: 16 }}>
        <Steps
          current={currentStep}
          status={run.state === 'failed' ? 'error' : undefined}
          items={[
            { title: '创建', icon: currentStep === 0 ? <LoadingOutlined /> : <CheckCircleOutlined /> },
            { title: '解析 PRD', icon: currentStep === 1 ? <LoadingOutlined /> : undefined },
            { title: '生成用例', icon: currentStep === 2 ? <LoadingOutlined /> : undefined },
            { title: '等待审批', icon: currentStep === 3 ? <ClockCircleOutlined /> : undefined },
            { title: '执行测试', icon: currentStep === 4 ? <LoadingOutlined /> : undefined },
            { title: 'AI 审核', icon: currentStep === 5 ? <LoadingOutlined /> : undefined },
            { title: '报告就绪', icon: currentStep === 6 ? <ClockCircleOutlined /> : undefined },
            { title: '完成', icon: run.state === 'completed' ? <CheckCircleOutlined /> : undefined },
          ]}
        />

        {['executing', 'parsing', 'generating', 'codex_reviewing'].includes(run.state) && (
          <div style={{ marginTop: 24 }}>
            <Progress percent={progress} status="active" />
          </div>
        )}
      </Card>

      <Card title="运行信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="PRD 路径">{run.prdPath}</Descriptions.Item>
          <Descriptions.Item label="工作空间">{run.workspacePath}</Descriptions.Item>
          <Descriptions.Item label="测试路由">{run.testedRoutes?.join(', ')}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(run.createdAt).toLocaleString()}
          </Descriptions.Item>
          {run.completedAt && (
            <Descriptions.Item label="完成时间">
              {new Date(run.completedAt).toLocaleString()}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Approval section */}
      {run.state === 'awaiting_approval' && (
        <Card title="测试用例审批" style={{ marginBottom: 16 }}>
          <Alert
            type="info"
            message="请审核生成的测试用例"
            description="确认测试用例符合预期后，点击批准开始执行测试"
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button type="primary" onClick={() => setApprovalModalOpen(true)}>
              审批测试用例
            </Button>
          </Space>
        </Card>
      )}

      {/* Confirmation section */}
      {run.state === 'report_ready' && (
        <Card title="报告确认" style={{ marginBottom: 16 }}>
          <Alert
            type="success"
            message="测试报告已生成"
            description="请查看测试报告并确认结果"
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button type="primary" onClick={() => navigate(`/reports/${run.id}`)}>
              查看报告
            </Button>
            <Button onClick={() => setConfirmModalOpen(true)}>确认/重测</Button>
          </Space>
        </Card>
      )}

      {/* Execution progress */}
      {run.state === 'executing' && completedSteps.length > 0 && (
        <Card title="执行进度" style={{ marginBottom: 16 }}>
          <List
            size="small"
            dataSource={completedSteps.slice(-10)}
            renderItem={(step: any) => (
              <List.Item>
                <Space>
                  {step.status === 'passed' ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <Text>{step.stepId}</Text>
                  <Tag>{step.stepType}</Tag>
                  <Text type="secondary">{step.duration}ms</Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Latest screenshot */}
      {latestScreenshot && (
        <Card title="最新截图" style={{ marginBottom: 16 }}>
          <Image src={latestScreenshot} style={{ maxWidth: '100%' }} />
        </Card>
      )}

      {/* Approval Modal */}
      <Modal
        title="审批测试用例"
        open={approvalModalOpen}
        onCancel={() => setApprovalModalOpen(false)}
        footer={null}
      >
        <TextArea
          rows={3}
          placeholder="审批意见（可选）"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleApproval(true)}
            loading={approvalMutation.isLoading}
          >
            批准
          </Button>
          <Button
            danger
            onClick={() => handleApproval(false)}
            loading={approvalMutation.isLoading}
          >
            拒绝
          </Button>
        </Space>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        title="确认测试结果"
        open={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        footer={null}
      >
        <TextArea
          rows={3}
          placeholder="确认意见（可选）"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleConfirmation(true)}
            loading={confirmMutation.isLoading}
          >
            确认完成
          </Button>
          <Button onClick={() => handleConfirmation(false, true)} loading={confirmMutation.isLoading}>
            重新测试
          </Button>
          <Button onClick={() => setConfirmModalOpen(false)}>取消</Button>
        </Space>
      </Modal>
    </div>
  );
};

export default TestRunDetail;

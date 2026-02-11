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
  Tabs,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  FileTextOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { getSocket, joinTestRun, leaveTestRun, SocketEvents } from '../lib/socket';
import { ResumeRunDialog } from '../components/ResumeRunDialog';
import { RequirementList } from '../components/RequirementList';
import { TestCaseList } from '../components/TestCaseList';
import { ApprovalActions } from '../components/ApprovalActions';
import { ScriptPreviewModal } from '../components/ScriptPreviewModal';

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
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [scriptPreviewOpen, setScriptPreviewOpen] = useState(false);
  const [comments, setComments] = useState('');
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<any[]>([]);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [selectedRequirement, setSelectedRequirement] = useState<string | null>(null);
  const [cliLogs, setCliLogs] = useState<Array<{
    source: 'claude' | 'codex';
    type: 'stdout' | 'stderr' | 'info';
    message: string;
    timestamp: string;
  }>>([]);

  // Fetch test run
  const { data: run, isLoading, refetch } = trpc.testRun.getById.useQuery(
    { id: runId! },
    { enabled: !!runId, refetchInterval: 5000 }
  );

  // Fetch requirements (only when awaiting_approval)
  const { data: requirements, isLoading: requirementsLoading } = trpc.testRun.getRequirements.useQuery(
    { runId: runId! },
    { enabled: !!runId && run?.state === 'awaiting_approval' }
  );

  // Fetch test cases (only when awaiting_approval)
  const { data: testCases, isLoading: testCasesLoading } = trpc.testRun.getTestCases.useQuery(
    { runId: runId! },
    { enabled: !!runId && run?.state === 'awaiting_approval' }
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

    // Listen for CLI logs
    socket.on(SocketEvents.CLI_LOG, (data: any) => {
      if (data.runId === runId) {
        setCliLogs(prev => [...prev.slice(-99), {
          source: data.source,
          type: data.type,
          message: data.message,
          timestamp: data.timestamp,
        }]);
      }
    });

    return () => {
      leaveTestRun(runId);
      socket.off(SocketEvents.STATE_TRANSITION);
      socket.off(SocketEvents.STEP_COMPLETED);
      socket.off(SocketEvents.STEP_SCREENSHOT);
      socket.off(SocketEvents.PROGRESS_UPDATE);
      socket.off(SocketEvents.CLI_LOG);
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

      {/* Resume execution section - show when not actively running */}
      {!['executing', 'codex_reviewing', 'parsing', 'generating'].includes(run.state) && (
        <Card title="恢复执行" style={{ marginBottom: 16 }}>
          <Alert
            type="info"
            message="断点续跑"
            description="如果之前的执行中断，可以从某个步骤恢复执行，复用已有的输出文件。"
            style={{ marginBottom: 16 }}
          />
          <Button 
            icon={<ReloadOutlined />}
            onClick={() => setResumeDialogOpen(true)}
          >
            恢复执行
          </Button>
        </Card>
      )}

      {/* Approval section */}
      {run.state === 'awaiting_approval' && (
        <Card 
          title="测试用例审批" 
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Tag color="processing">等待审批</Tag>
              <Text type="secondary">
                {requirements?.total || 0} 个需求，{testCases?.total || 0} 个用例
              </Text>
            </Space>
          }
        >
          <Alert
            type="info"
            message="请审核生成的测试用例"
            description="查看下方的需求和测试用例列表，确认符合预期后点击「批准执行」开始测试。如有问题可点击「拒绝」并提供反馈。"
            style={{ marginBottom: 16 }}
          />
          
          <Tabs
            defaultActiveKey="requirements"
            items={[
              {
                key: 'requirements',
                label: (
                  <span>
                    <FileTextOutlined />
                    需求列表 ({requirements?.total || 0})
                  </span>
                ),
                children: (
                  <RequirementList
                    requirements={requirements}
                    selectedRequirement={selectedRequirement}
                    onSelect={setSelectedRequirement}
                    loading={requirementsLoading}
                  />
                ),
              },
              {
                key: 'testcases',
                label: (
                  <span>
                    <ExperimentOutlined />
                    测试用例 ({testCases?.total || 0})
                  </span>
                ),
                children: (
                  <TestCaseList
                    testCases={testCases}
                    selectedRequirement={selectedRequirement}
                    loading={testCasesLoading}
                  />
                ),
              },
            ]}
          />
          
          <ApprovalActions
            runId={runId!}
            onPreviewScript={() => setScriptPreviewOpen(true)}
            onDownloadScript={() => message.info('下载功能开发中')}
            onApprovalComplete={() => refetch()}
          />
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

      {/* CLI Logs */}
      {['parsing', 'generating', 'executing', 'codex_reviewing'].includes(run.state) && (
        <Card 
          title="执行日志" 
          style={{ marginBottom: 16 }}
          extra={<Text type="secondary">{cliLogs.length} 条日志</Text>}
        >
          <div 
            style={{ 
              maxHeight: 300, 
              overflow: 'auto', 
              backgroundColor: '#1e1e1e', 
              padding: 12, 
              borderRadius: 4,
              fontFamily: 'Monaco, Menlo, monospace',
              fontSize: 12,
            }}
          >
            {cliLogs.length === 0 ? (
              <Text style={{ color: '#888' }}>等待日志输出...</Text>
            ) : (
              cliLogs.map((log, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  <Text style={{ 
                    color: log.type === 'stderr' ? '#ff6b6b' : 
                           log.type === 'info' ? '#69db7c' : '#ced4da',
                  }}>
                    <span style={{ color: '#868e96' }}>
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    {' '}
                    <Tag 
                      color={log.source === 'claude' ? 'blue' : 'purple'} 
                      style={{ fontSize: 10 }}
                    >
                      {log.source}
                    </Tag>
                    {' '}
                    {log.message}
                  </Text>
                </div>
              ))
            )}
          </div>
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

      {/* Resume Run Dialog */}
      <ResumeRunDialog
        open={resumeDialogOpen}
        runId={runId!}
        onClose={() => setResumeDialogOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Script Preview Modal */}
      <ScriptPreviewModal
        open={scriptPreviewOpen}
        runId={runId!}
        onClose={() => setScriptPreviewOpen(false)}
      />
    </div>
  );
};

export default TestRunDetail;

/**
 * Approval Actions Component
 * 审批操作按钮组件
 * @see Requirements 4.1, 4.2, 4.3
 */

import React, { useState } from 'react';
import {
  Button,
  Space,
  Modal,
  Input,
  Select,
  Form,
  message,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { trpc } from '../lib/trpc';

const { TextArea } = Input;
const { Option } = Select;

interface ApprovalActionsProps {
  runId: string;
  onPreviewScript: () => void;
  onDownloadScript: () => void;
  onApprovalComplete?: () => void;
}

/**
 * 反馈类型选项
 */
const feedbackTypes = [
  { value: 'coverage_incomplete', label: '测试用例覆盖不全' },
  { value: 'steps_incorrect', label: '测试步骤不正确' },
  { value: 'assertions_inaccurate', label: '断言不准确' },
  { value: 'other', label: '其他' },
];

export const ApprovalActions: React.FC<ApprovalActionsProps> = ({
  runId,
  onPreviewScript,
  onDownloadScript,
  onApprovalComplete,
}) => {
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [approveComments, setApproveComments] = useState('');
  const [rejectForm] = Form.useForm();

  // 审批通过 mutation
  const approveMutation = trpc.testRun.submitApproval.useMutation({
    onSuccess: () => {
      message.success('审批通过，开始执行测试');
      setApproveModalOpen(false);
      setApproveComments('');
      onApprovalComplete?.();
    },
    onError: (error) => {
      message.error(`审批失败: ${error.message}`);
    },
  });

  // 重新生成 mutation (暂时使用 submitApproval 的拒绝功能)
  const rejectMutation = trpc.testRun.submitApproval.useMutation({
    onSuccess: () => {
      message.info('已拒绝，请使用恢复执行功能重新生成测试用例');
      setRejectModalOpen(false);
      rejectForm.resetFields();
      onApprovalComplete?.();
    },
    onError: (error) => {
      message.error(`操作失败: ${error.message}`);
    },
  });

  const handleApprove = () => {
    approveMutation.mutate({
      runId,
      approved: true,
      comments: approveComments || undefined,
      reviewerId: 'current-user', // TODO: 从认证上下文获取
    });
  };

  const handleReject = async () => {
    try {
      const values = await rejectForm.validateFields();
      rejectMutation.mutate({
        runId,
        approved: false,
        comments: `[${values.feedbackType}] ${values.feedbackDetail}`,
        reviewerId: 'current-user',
      });
    } catch {
      // 表单验证失败
    }
  };

  return (
    <div style={{ 
      padding: '16px 0', 
      borderTop: '1px solid #f0f0f0',
      marginTop: 16,
    }}>
      <Space size="middle" wrap>
        <Button
          icon={<CodeOutlined />}
          onClick={onPreviewScript}
        >
          预览脚本
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={onDownloadScript}
        >
          下载脚本
        </Button>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => setApproveModalOpen(true)}
        >
          批准执行
        </Button>
        <Button
          danger
          icon={<CloseCircleOutlined />}
          onClick={() => setRejectModalOpen(true)}
        >
          拒绝
        </Button>
      </Space>

      {/* 批准确认对话框 */}
      <Modal
        title="确认批准测试用例"
        open={approveModalOpen}
        onCancel={() => setApproveModalOpen(false)}
        onOk={handleApprove}
        okText="确认批准"
        cancelText="取消"
        confirmLoading={approveMutation.isLoading}
      >
        <Alert
          type="info"
          message="批准后将开始执行测试"
          description="请确认测试用例符合预期，批准后系统将自动执行 Playwright 测试脚本。"
          style={{ marginBottom: 16 }}
        />
        <TextArea
          rows={3}
          placeholder="审批意见（可选）"
          value={approveComments}
          onChange={(e) => setApproveComments(e.target.value)}
        />
      </Modal>

      {/* 拒绝反馈对话框 */}
      <Modal
        title="拒绝测试用例"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        okText="提交反馈"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={rejectMutation.isLoading}
      >
        <Alert
          type="warning"
          message="拒绝后需要重新生成"
          description="请提供详细的反馈意见，以便 AI 生成更准确的测试用例。拒绝后可以使用「恢复执行」功能从 PRD 解析步骤重新开始。"
          style={{ marginBottom: 16 }}
        />
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="feedbackType"
            label="反馈类型"
            rules={[{ required: true, message: '请选择反馈类型' }]}
          >
            <Select placeholder="请选择反馈类型">
              {feedbackTypes.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="feedbackDetail"
            label="详细反馈"
            rules={[{ required: true, message: '请提供详细的反馈意见' }]}
          >
            <TextArea
              rows={4}
              placeholder="请描述具体问题，例如：缺少对边界条件的测试、某个步骤的选择器不正确等"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApprovalActions;

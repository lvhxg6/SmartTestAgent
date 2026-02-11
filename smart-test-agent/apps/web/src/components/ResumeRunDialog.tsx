/**
 * Resume Run Dialog Component
 * 恢复执行对话框，允许用户选择从哪个步骤恢复执行
 * @see Requirements 5.2, 5.5, 5.6
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Select,
  Alert,
  Space,
  Typography,
  Tag,
  Spin,
  List,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { trpc } from '../lib/trpc';

const { Text } = Typography;

/**
 * 步骤类型
 */
type ResumableStep = 
  | 'prd_parsing'
  | 'test_execution'
  | 'codex_review'
  | 'cross_validation'
  | 'report_generation'
  | 'quality_gate';

/**
 * 可恢复步骤信息
 */
interface ResumableStepInfo {
  step: ResumableStep;
  label: string;
  available: boolean;
  missingFiles: string[];
}

interface ResumeRunDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 运行 ID */
  runId: string;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 恢复成功回调 */
  onSuccess?: () => void;
}

/**
 * 恢复执行对话框组件
 */
export const ResumeRunDialog: React.FC<ResumeRunDialogProps> = ({
  open,
  runId,
  onClose,
  onSuccess,
}) => {
  const [selectedStep, setSelectedStep] = useState<ResumableStep | null>(null);

  // 获取可恢复步骤
  const { 
    data: resumableData, 
    isLoading, 
    error,
    refetch,
  } = trpc.testRun.getResumableSteps.useQuery(
    { runId },
    { enabled: open && !!runId }
  );

  // 恢复执行 mutation
  const resumeMutation = trpc.testRun.resumeRun.useMutation({
    onSuccess: () => {
      message.success('恢复执行已启动');
      onClose();
      onSuccess?.();
    },
    onError: (error) => {
      message.error(`恢复执行失败: ${error.message}`);
    },
  });

  // 当对话框打开时重新获取数据
  useEffect(() => {
    if (open) {
      refetch();
      setSelectedStep(null);
    }
  }, [open, refetch]);

  // 自动选择第一个可用的步骤
  useEffect(() => {
    if (resumableData?.steps && !selectedStep) {
      const firstAvailable = resumableData.steps.find(s => s.available);
      if (firstAvailable) {
        setSelectedStep(firstAvailable.step);
      }
    }
  }, [resumableData, selectedStep]);

  const handleResume = () => {
    if (!selectedStep) {
      message.warning('请选择要恢复的步骤');
      return;
    }
    resumeMutation.mutate({ runId, fromStep: selectedStep });
  };

  const availableSteps = resumableData?.steps?.filter(s => s.available) || [];
  const unavailableSteps = resumableData?.steps?.filter(s => !s.available) || [];

  return (
    <Modal
      title="恢复执行"
      open={open}
      onCancel={onClose}
      onOk={handleResume}
      okText="恢复执行"
      cancelText="取消"
      okButtonProps={{ 
        disabled: !selectedStep || resumeMutation.isLoading,
        loading: resumeMutation.isLoading,
      }}
      width={600}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin tip="正在检查可恢复步骤..." />
        </div>
      ) : error ? (
        <Alert
          type="error"
          message="获取可恢复步骤失败"
          description={error.message}
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            message="选择恢复点"
            description="选择要从哪个步骤开始恢复执行。只有前置文件完整的步骤才能恢复。"
          />

          {availableSteps.length > 0 ? (
            <>
              <div>
                <Text strong>选择恢复步骤：</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="选择要恢复的步骤"
                  value={selectedStep}
                  onChange={setSelectedStep}
                  options={availableSteps.map(step => ({
                    value: step.step,
                    label: (
                      <Space>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        {step.label}
                      </Space>
                    ),
                  }))}
                />
              </div>

              {selectedStep && (
                <Alert
                  type="success"
                  message={`将从 "${availableSteps.find(s => s.step === selectedStep)?.label}" 步骤开始恢复执行`}
                  description="之前的步骤将被跳过，使用已有的输出文件。"
                />
              )}
            </>
          ) : (
            <Alert
              type="warning"
              message="没有可恢复的步骤"
              description="所有步骤都缺少必要的前置文件，无法恢复执行。"
            />
          )}

          {unavailableSteps.length > 0 && (
            <div>
              <Text type="secondary">不可恢复的步骤（缺少前置文件）：</Text>
              <List
                size="small"
                dataSource={unavailableSteps}
                renderItem={(step: ResumableStepInfo) => (
                  <List.Item>
                    <Space>
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                      <Text delete type="secondary">{step.label}</Text>
                      <Tag color="red" style={{ fontSize: 10 }}>
                        缺少: {step.missingFiles.join(', ')}
                      </Tag>
                    </Space>
                  </List.Item>
                )}
                style={{ marginTop: 8 }}
              />
            </div>
          )}
        </Space>
      )}
    </Modal>
  );
};

export default ResumeRunDialog;

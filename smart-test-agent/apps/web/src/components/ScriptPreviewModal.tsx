/**
 * Script Preview Modal Component
 * Playwright 脚本预览对话框
 * @see Requirements 6.1, 6.2, 6.3
 */

import React from 'react';
import {
  Modal,
  Button,
  Space,
  Spin,
  Alert,
  Typography,
  message,
} from 'antd';
import {
  DownloadOutlined,
  CopyOutlined,
  FileZipOutlined,
} from '@ant-design/icons';
import { trpc } from '../lib/trpc';

const { Text } = Typography;

interface ScriptPreviewModalProps {
  open: boolean;
  runId: string;
  caseIds?: string[];
  onClose: () => void;
}

/**
 * 简单的语法高亮组件
 * 为 JavaScript 代码添加基本的语法高亮
 */
const CodeHighlight: React.FC<{ code: string }> = ({ code }) => {
  // 简单的语法高亮处理
  const highlightCode = (code: string) => {
    return code
      // 注释
      .replace(/(\/\/.*$)/gm, '<span style="color: #6a9955;">$1</span>')
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color: #6a9955;">$1</span>')
      // 字符串
      .replace(/('.*?')/g, '<span style="color: #ce9178;">$1</span>')
      .replace(/(".*?")/g, '<span style="color: #ce9178;">$1</span>')
      .replace(/(`.*?`)/gs, '<span style="color: #ce9178;">$1</span>')
      // 关键字
      .replace(/\b(const|let|var|function|async|await|return|if|else|for|while|try|catch|finally|throw|new|class|extends|import|export|from|default)\b/g, 
        '<span style="color: #569cd6;">$1</span>')
      // 内置对象
      .replace(/\b(console|require|module|exports|process|Buffer|Promise)\b/g,
        '<span style="color: #4ec9b0;">$1</span>')
      // 数字
      .replace(/\b(\d+)\b/g, '<span style="color: #b5cea8;">$1</span>')
      // 布尔值
      .replace(/\b(true|false|null|undefined)\b/g, '<span style="color: #569cd6;">$1</span>');
  };

  return (
    <pre
      style={{
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: 16,
        borderRadius: 4,
        overflow: 'auto',
        maxHeight: 500,
        fontSize: 13,
        fontFamily: 'Monaco, Menlo, "Courier New", monospace',
        lineHeight: 1.5,
        margin: 0,
      }}
      dangerouslySetInnerHTML={{ __html: highlightCode(code) }}
    />
  );
};

export const ScriptPreviewModal: React.FC<ScriptPreviewModalProps> = ({
  open,
  runId,
  caseIds,
  onClose,
}) => {
  // 调用真实 API 获取脚本
  const { data, isLoading, error } = trpc.testRun.generateScript.useQuery(
    { runId, caseIds },
    { enabled: open && !!runId }
  );

  // 下载脚本 mutation
  const downloadMutation = trpc.testRun.downloadScript.useMutation({
    onSuccess: (result) => {
      if (result.format === 'single' && 'content' in result) {
        // 单文件下载
        const blob = new Blob([result.content], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('脚本下载成功');
      } else if (result.format === 'zip' && 'content' in result && 'encoding' in result && result.encoding === 'base64') {
        // ZIP 文件下载
        const byteCharacters = atob(result.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('脚本包下载成功');
      }
    },
    onError: (err) => {
      message.error(`下载失败: ${err.message}`);
    },
  });

  const handleCopy = async () => {
    if (!data?.content) {
      message.error('没有可复制的内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(data.content);
      message.success('脚本已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const handleDownloadSingle = () => {
    downloadMutation.mutate({ runId, caseIds, format: 'single' });
  };

  const handleDownloadZip = () => {
    downloadMutation.mutate({ runId, caseIds, format: 'zip' });
  };

  return (
    <Modal
      title="Playwright 脚本预览"
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy} disabled={!data?.content}>
          复制脚本
        </Button>,
        <Button 
          key="download" 
          icon={<DownloadOutlined />} 
          onClick={handleDownloadSingle}
          loading={downloadMutation.isLoading}
        >
          下载脚本
        </Button>,
        <Button 
          key="download-zip" 
          icon={<FileZipOutlined />} 
          onClick={handleDownloadZip}
          loading={downloadMutation.isLoading}
        >
          下载 ZIP
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在生成脚本...</Text>
          </div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          message="生成脚本失败"
          description={error.message}
        />
      ) : data ? (
        <>
          <Alert
            type="info"
            message={`脚本预览 - 包含 ${data.testCaseCount} 个测试用例`}
            description={
              <Space direction="vertical" size={0}>
                <Text type="secondary">文件名: {data.filename}</Text>
                <Text type="secondary">生成时间: {new Date(data.generatedAt).toLocaleString()}</Text>
              </Space>
            }
            style={{ marginBottom: 16 }}
          />
          <CodeHighlight code={data.content} />
        </>
      ) : null}
    </Modal>
  );
};

export default ScriptPreviewModal;

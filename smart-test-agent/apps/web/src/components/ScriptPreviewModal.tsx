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
} from '@ant-design/icons';

const { Text } = Typography;

interface ScriptPreviewModalProps {
  open: boolean;
  runId: string;
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

/**
 * 生成示例 Playwright 脚本
 * 实际项目中应该从后端 API 获取
 */
const generateSampleScript = (runId: string): string => {
  return `/**
 * Auto-generated Playwright Test Script
 * Run ID: ${runId}
 * Generated at: ${new Date().toISOString()}
 * 
 * 使用方法:
 * 1. 确保已安装 Playwright: npm install playwright
 * 2. 运行脚本: node test-${runId.slice(0, 8)}.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 配置信息（从 target-profile.json 加载）
const config = {
  baseUrl: 'http://localhost:3000',
  browser: {
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
  },
  login: {
    loginUrl: '/login',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: 'button[type="submit"]',
    successIndicator: '.dashboard',
    credentials: {
      username: 'test_user',
      password: '******',
    },
  },
};

// 测试用例（从 test-cases.json 加载）
const testCases = [
  // 测试用例将在此处填充
];

// 结果存储
const results = {
  run_id: '${runId}',
  started_at: null,
  completed_at: null,
  test_cases: [],
};

// 截图工具函数
async function captureScreenshot(page, name) {
  const dir = 'evidence/screenshots';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const screenshotPath = path.join(dir, \`\${name}.png\`);
  await page.screenshot({ path: screenshotPath });
  return screenshotPath;
}

// 登录函数
async function performLogin(page) {
  const { login } = config;
  
  await page.goto(config.baseUrl + login.loginUrl);
  await page.locator(login.usernameSelector).fill(login.credentials.username);
  await page.locator(login.passwordSelector).fill(login.credentials.password);
  await page.locator(login.submitSelector).click();
  await page.waitForSelector(login.successIndicator, { timeout: 30000 });
  await captureScreenshot(page, '00-login-success');
  
  console.log('✓ 登录成功');
}

// 主函数
async function main() {
  results.started_at = new Date().toISOString();
  console.log('开始执行测试...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const context = await browser.newContext({
    viewport: config.browser.viewport,
    locale: config.browser.locale,
    ignoreHTTPSErrors: config.browser.ignoreHTTPSErrors,
  });
  
  const page = await context.newPage();
  
  try {
    // 执行登录
    await performLogin(page);
    
    // 执行测试用例
    for (const testCase of testCases) {
      console.log(\`执行测试用例: \${testCase.case_id} - \${testCase.title}\`);
      // 测试用例执行逻辑
    }
    
    console.log('\\n✓ 所有测试执行完成');
  } catch (error) {
    console.error('测试执行失败:', error);
  } finally {
    await browser.close();
    
    results.completed_at = new Date().toISOString();
    fs.writeFileSync('execution-results.json', JSON.stringify(results, null, 2));
    console.log('结果已保存到 execution-results.json');
  }
}

main().catch(console.error);
`;
};

export const ScriptPreviewModal: React.FC<ScriptPreviewModalProps> = ({
  open,
  runId,
  onClose,
}) => {
  // TODO: 实际项目中应该从后端 API 获取脚本
  const script = generateSampleScript(runId);
  const isLoading = false;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      message.success('脚本已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([script], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-${runId.slice(0, 8)}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('脚本下载成功');
  };

  return (
    <Modal
      title="Playwright 脚本预览"
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy}>
          复制脚本
        </Button>,
        <Button key="download" icon={<DownloadOutlined />} onClick={handleDownload}>
          下载脚本
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
      ) : (
        <>
          <Alert
            type="info"
            message="脚本预览"
            description="这是根据测试用例生成的 Playwright 脚本预览。实际执行时会使用完整的测试用例数据。"
            style={{ marginBottom: 16 }}
          />
          <CodeHighlight code={script} />
        </>
      )}
    </Modal>
  );
};

export default ScriptPreviewModal;

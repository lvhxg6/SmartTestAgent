/**
 * Project Configuration Page
 * Target Profile configuration form
 * @see Requirements 17.1
 */

import React, { useEffect } from 'react';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Card,
  Space,
  message,
  Spin,
  Typography,
  Divider,
} from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';

const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * Project configuration page component
 */
export const ProjectConfig: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // Fetch project
  const { data: project, isLoading: projectLoading } = trpc.project.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );

  // Fetch existing profile
  const { data: profile, isLoading: profileLoading } = trpc.targetProfile.getByProjectId.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, retry: false }
  );

  // Upsert mutation
  const upsertMutation = trpc.targetProfile.upsert.useMutation({
    onSuccess: () => {
      message.success('配置保存成功');
    },
    onError: (error) => {
      message.error(error.message);
    },
  });

  // Validate mutation
  const validateMutation = trpc.targetProfile.validate.useMutation({
    onSuccess: (result) => {
      if (result.valid) {
        message.success('配置验证通过');
      } else {
        message.warning(`配置验证失败: ${result.errors.join(', ')}`);
      }
    },
  });

  // Set form values when profile is loaded
  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        baseUrl: profile.baseUrl,
        browser: profile.browser,
        login: profile.login,
        allowedRoutes: profile.allowedRoutes.join('\n'),
        deniedRoutes: profile.deniedRoutes?.join('\n') || '',
        allowedOperations: profile.allowedOperations,
        sourceCode: profile.sourceCode,
        uiFramework: profile.uiFramework,
        antdQuirks: profile.antdQuirks,
      });
    }
  }, [profile, form]);

  const handleSubmit = async (values: any) => {
    const data = {
      projectId: projectId!,
      baseUrl: values.baseUrl,
      browser: values.browser,
      login: values.login,
      allowedRoutes: values.allowedRoutes.split('\n').filter((r: string) => r.trim()),
      deniedRoutes: values.deniedRoutes?.split('\n').filter((r: string) => r.trim()) || [],
      allowedOperations: values.allowedOperations,
      deniedOperations: [],
      sourceCode: values.sourceCode,
      uiFramework: values.uiFramework,
      antdQuirks: values.uiFramework === 'antd' ? values.antdQuirks : undefined,
    };

    upsertMutation.mutate(data);
  };

  const handleValidate = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        projectId: projectId!,
        baseUrl: values.baseUrl,
        browser: values.browser,
        login: values.login,
        allowedRoutes: values.allowedRoutes.split('\n').filter((r: string) => r.trim()),
        deniedRoutes: values.deniedRoutes?.split('\n').filter((r: string) => r.trim()) || [],
        allowedOperations: values.allowedOperations,
        deniedOperations: [],
        sourceCode: values.sourceCode,
        uiFramework: values.uiFramework,
        antdQuirks: values.uiFramework === 'antd' ? values.antdQuirks : undefined,
      };
      validateMutation.mutate(data);
    } catch (error) {
      message.error('请先填写完整的配置信息');
    }
  };

  if (projectLoading || profileLoading) {
    return <Spin size="large" />;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4}>项目配置: {project?.name}</Title>
        <Text type="secondary">配置测试目标的基本信息、登录凭证和测试范围</Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          browser: {
            ignoreHTTPSErrors: true,
            viewport: { width: 1920, height: 1080 },
            locale: 'zh-CN',
            timeoutMs: 30000,
          },
          login: {
            loginUrl: '/#/login',
            usernameSelector: "input[placeholder='请输入用户名']",
            passwordSelector: "input[placeholder='请输入密码']",
            submitSelector: "button:has-text('登录')",
            credentials: {
              username: '$TEST_USERNAME',
              password: '$TEST_PASSWORD',
            },
            successIndicator: '/#/myWorkSatp',
          },
          uiFramework: 'antd',
          allowedOperations: ['query', 'view_detail'],
          antdQuirks: {
            buttonTextSpace: true,
            selectType: 'custom',
            modalCloseSelector: '.ant-modal-close',
          },
        }}
      >
        <Card title="基本配置" style={{ marginBottom: 16 }}>
          <Form.Item
            name="baseUrl"
            label="目标 URL"
            rules={[{ required: true, type: 'url', message: '请输入有效的 URL' }]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>

          <Form.Item name="uiFramework" label="UI 框架">
            <Select>
              <Select.Option value="antd">Ant Design</Select.Option>
              <Select.Option value="element-ui">Element UI</Select.Option>
              <Select.Option value="custom">自定义</Select.Option>
            </Select>
          </Form.Item>
        </Card>

        <Card title="浏览器配置" style={{ marginBottom: 16 }}>
          <Space size="large">
            <Form.Item name={['browser', 'viewport', 'width']} label="视口宽度">
              <InputNumber min={320} max={3840} />
            </Form.Item>
            <Form.Item name={['browser', 'viewport', 'height']} label="视口高度">
              <InputNumber min={240} max={2160} />
            </Form.Item>
            <Form.Item name={['browser', 'timeoutMs']} label="超时时间 (ms)">
              <InputNumber min={1000} max={120000} step={1000} />
            </Form.Item>
          </Space>
          <Form.Item name={['browser', 'locale']} label="语言区域">
            <Input placeholder="zh-CN" />
          </Form.Item>
          <Form.Item name={['browser', 'ignoreHTTPSErrors']} label="忽略 HTTPS 错误" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Card>

        <Card title="登录配置" style={{ marginBottom: 16 }}>
          <Form.Item
            name={['login', 'loginUrl']}
            label="登录页面 URL"
            rules={[{ required: true, message: '请输入登录页面 URL' }]}
          >
            <Input placeholder="/#/login" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name={['login', 'usernameSelector']} label="用户名选择器" style={{ flex: 1 }}>
              <Input placeholder="input[placeholder='请输入用户名']" />
            </Form.Item>
            <Form.Item name={['login', 'passwordSelector']} label="密码选择器" style={{ flex: 1 }}>
              <Input placeholder="input[placeholder='请输入密码']" />
            </Form.Item>
            <Form.Item name={['login', 'submitSelector']} label="提交按钮选择器" style={{ flex: 1 }}>
              <Input placeholder="button:has-text('登录')" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name={['login', 'credentials', 'username']} label="用户名" style={{ flex: 1 }}>
              <Input placeholder="$TEST_USERNAME" />
            </Form.Item>
            <Form.Item name={['login', 'credentials', 'password']} label="密码" style={{ flex: 1 }}>
              <Input.Password placeholder="$TEST_PASSWORD" />
            </Form.Item>
          </div>
          <Form.Item name={['login', 'successIndicator']} label="登录成功标识">
            <Input placeholder="/#/myWorkSatp" />
          </Form.Item>
        </Card>

        <Card title="测试范围" style={{ marginBottom: 16 }}>
          <Form.Item
            name="allowedRoutes"
            label="允许测试的路由（每行一个）"
            rules={[{ required: true, message: '请至少输入一个路由' }]}
          >
            <TextArea rows={4} placeholder="/dashboard&#10;/users&#10;/settings" />
          </Form.Item>
          <Form.Item name="deniedRoutes" label="禁止测试的路由（每行一个）">
            <TextArea rows={2} placeholder="/admin&#10;/system" />
          </Form.Item>
          <Form.Item name="allowedOperations" label="允许的操作类型">
            <Select mode="multiple">
              <Select.Option value="query">查询</Select.Option>
              <Select.Option value="view_detail">查看详情</Select.Option>
              <Select.Option value="search">搜索</Select.Option>
              <Select.Option value="filter">筛选</Select.Option>
              <Select.Option value="paginate">分页</Select.Option>
              <Select.Option value="create">创建</Select.Option>
              <Select.Option value="edit">编辑</Select.Option>
              <Select.Option value="delete">删除</Select.Option>
            </Select>
          </Form.Item>
        </Card>

        <Card title="源码配置" style={{ marginBottom: 16 }}>
          <Form.Item name={['sourceCode', 'frontendRoot']} label="前端根目录">
            <Input placeholder="./src" />
          </Form.Item>
          <Form.Item name={['sourceCode', 'routerFile']} label="路由文件路径">
            <Input placeholder="./src/router/index.ts" />
          </Form.Item>
          <Form.Item name={['sourceCode', 'pageDir']} label="页面目录">
            <Input placeholder="./src/pages" />
          </Form.Item>
          <Form.Item name={['sourceCode', 'apiDir']} label="API 目录">
            <Input placeholder="./src/api" />
          </Form.Item>
        </Card>

        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.uiFramework !== curr.uiFramework}>
          {({ getFieldValue }) =>
            getFieldValue('uiFramework') === 'antd' && (
              <Card title="Ant Design 特殊配置" style={{ marginBottom: 16 }}>
                <Form.Item name={['antdQuirks', 'buttonTextSpace']} label="按钮文字空格处理" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name={['antdQuirks', 'selectType']} label="Select 组件类型">
                  <Select>
                    <Select.Option value="custom">自定义下拉</Select.Option>
                    <Select.Option value="native">原生下拉</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name={['antdQuirks', 'modalCloseSelector']} label="Modal 关闭按钮选择器">
                  <Input placeholder=".ant-modal-close" />
                </Form.Item>
              </Card>
            )
          }
        </Form.Item>

        <Divider />

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={upsertMutation.isLoading}>
              保存配置
            </Button>
            <Button onClick={handleValidate} loading={validateMutation.isLoading}>
              验证配置
            </Button>
            <Button type="default" onClick={() => navigate(`/routes/${projectId}`)}>
              选择路由
            </Button>
            <Button onClick={() => navigate('/')}>返回</Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
};

export default ProjectConfig;

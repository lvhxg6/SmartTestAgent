import React, { Component } from 'react';
import {
  Alert,
  Button,
  Form,
  InputNumber,
  Select,
  Modal,
  Switch,
  Radio,
  Tabs,
  TreeSelect,
  Checkbox,
  message,
  Spin,
  Tooltip
} from 'antd';
import { Address, withRouter, request } from 'smart-frame';
import dataJson from '@/config/dataJson';
import './index.less';
import moment from 'moment';
import 'moment/locale/zh-cn';
import BlindTimeTable from './components/BlindTimeTable';
import ToolCardSelect from './components/ToolCardSelect';
import ManualTriggerModal from './components/ManualTriggerModal';
import RoundTrackingModal from './components/RoundTrackingModal';

moment.locale('zh-cn');

const { TabPane } = Tabs;

// 扫描类型配置
const SCAN_TYPES = {
  baseline: { key: 'baseline', label: '基线检测', showRawResult: true },
  weak_pwd: { key: 'weak_pwd', label: '弱口令检测', showRawResult: true },
  sys_vuln: { key: 'sys_vuln', label: '系统漏洞', showRawResult: false },
  ext_vuln: { key: 'ext_vuln', label: '外部漏洞', showRawResult: false }
};

@withRouter
class AutoScanConfig extends Component {
  constructor(props) {
    super(props);
    this.state = {
      locationVal: this.props.location.pathname,
      activeTab: 'baseline',
      loading: false,
      saving: false,
      // 配置数据
      configData: {
        isEnabled: false,
        scanDay: 1,
        startTime: 0,
        maxAssetPerTask: 100,
        timeoutHours: 2,
        createUserId: null,
        assetScope: 'all',
        toolId: null,
        templateId: null,
        saveRawResult: true,
        blindTimeInterval: 1,
        blindTimeList: [],
        systemIds: [],
        nextExecTime: null
      },
      // 下拉选项数据
      userList: [],
      systemTreeData: [],
      toolList: [],
      templateList: [],
      // 弹框控制
      manualTriggerVisible: false,
      roundTrackingVisible: false,
      // 配置是否有修改
      hasChanges: false,
      // 开始时间校验状态
      startTimeValidateStatus: '',
      startTimeValidateHelp: '',
      // 下次执行时间信息（智能调度）
      nextExecTimeInfo: null
    };
    this.formRef = React.createRef();
  }

  componentDidMount() {
    this.loadConfig(this.state.activeTab);
    this.loadUserList();
    this.loadSystemTree();
    this.loadToolList(this.state.activeTab);
  }

  // 加载配置
  loadConfig = (scanType) => {
    this.setState({ loading: true });
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/config/${scanType}`, {})
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          const data = res.data.entity || {};
          this.setState({
            configData: {
              isEnabled: data.isEnabled || false,
              scanDay: data.scanDay ? parseInt(data.scanDay) : 1,
              startTime: data.startTime !== null && data.startTime !== undefined ? parseInt(data.startTime) : 0,
              maxAssetPerTask: data.maxAssetPerTask || 100,
              timeoutHours: data.timeoutHours || 2,
              createUserId: data.createUserId || null,
              assetScope: data.assetScope || 'all',
              toolId: data.toolId || null,
              templateId: data.templateId || null,
              saveRawResult: data.saveRawResult !== false,
              blindTimeInterval: data.blindTimeInterval || 1,
              blindTimeList: data.blindTimeList || data.blindTimes || [],
              systemIds: data.systemIds || [],
              nextExecTime: data.nextExecTime || null
            },
            hasChanges: false
          }, () => {
            // 设置表单值
            if (this.formRef.current) {
              const formValues = { ...this.state.configData };
              // TreeSelect treeCheckStrictly 模式需要 {value, label} 格式
              if (formValues.systemIds && formValues.systemIds.length > 0) {
                formValues.systemIds = formValues.systemIds.map(id => {
                  const label = this.findSystemName(id, this.state.systemTreeData) || id;
                  return { value: id, label };
                });
              }
              console.log('[loadConfig] setFieldsValue systemIds:', JSON.stringify(formValues.systemIds));
              console.log('[loadConfig] systemTreeData length:', this.state.systemTreeData.length);
              this.formRef.current.setFieldsValue(formValues);
              // 验证设置后的值
              const afterValues = this.formRef.current.getFieldValue('systemIds');
              console.log('[loadConfig] after setFieldsValue, form systemIds:', JSON.stringify(afterValues));
            }
            // 加载模板列表
            if (data.toolId) {
              this.loadTemplateList(data.toolId, scanType);
            }
            // 智能调度：加载配置后自动计算实际执行时间
            if (data.startTime !== null && data.startTime !== undefined) {
              // 直接使用 data 而不是 state，确保参数正确
              this.validateStartTime(data.startTime, {
                scanDay: data.scanDay || 1,
                blindTimeInterval: data.blindTimeInterval || 1,
                blindTimeList: data.blindTimeList || []
              });
            }
          });
        }
      })
      .catch(err => {
        console.error('加载配置失败', err);
        message.error('加载配置失败');
      })
      .finally(() => {
        this.setState({ loading: false });
      });
  };

  // 加载用户列表
  loadUserList = () => {
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/users`, {})
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          this.setState({ userList: res.data.entity || [] });
        }
      })
      .catch(err => console.error('加载用户列表失败', err));
  };

  // 加载业务系统树
  loadSystemTree = () => {
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/systems`, {})
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          const treeData = this.transformTreeData(res.data.entity || []);
          this.setState({ systemTreeData: treeData }, () => {
            // 树数据加载完成后，重新设置systemIds的表单值（解决竞态问题）
            this.refreshSystemIdsFormValue();
          });
        }
      })
      .catch(err => console.error('加载业务系统失败', err));
  };

  // 从树数据中查找系统名称
  findSystemName = (id, treeData) => {
    if (!treeData) return null;
    for (const node of treeData) {
      if (node.value === id) return node.title;
      if (node.children) {
        const found = this.findSystemName(id, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // 刷新systemIds的表单值（树数据加载后调用）
  refreshSystemIdsFormValue = () => {
    const { configData, systemTreeData } = this.state;
    console.log('[refreshSystemIdsFormValue] configData.systemIds:', JSON.stringify(configData.systemIds));
    console.log('[refreshSystemIdsFormValue] systemTreeData:', JSON.stringify(systemTreeData));
    if (this.formRef.current && configData.systemIds && configData.systemIds.length > 0) {
      const labeledValues = configData.systemIds.map(id => ({
        value: id,
        label: this.findSystemName(id, systemTreeData) || id
      }));
      console.log('[refreshSystemIdsFormValue] setting labeledValues:', JSON.stringify(labeledValues));
      this.formRef.current.setFieldsValue({ systemIds: labeledValues });
    }
  };

  // 转换树形数据
  transformTreeData = (data) => {
    return data.map(item => ({
      title: item.systemName,
      value: item.id,
      key: item.id,
      children: item.children ? this.transformTreeData(item.children) : []
    }));
  };

  // 加载工具列表
  loadToolList = (scanType) => {
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/tools/${scanType}`, {})
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          this.setState({ toolList: res.data.entity || [] });
        }
      })
      .catch(err => console.error('加载工具列表失败', err));
  };

  // 加载模板列表
  loadTemplateList = (toolId, scanType) => {
    // 如果 toolId 为空，直接返回，不发起请求
    // 使用严格检查，确保 toolId 是有效的字符串
    if (!toolId || toolId === '' || typeof toolId !== 'string') {
      this.setState({ templateList: [] });
      return;
    }
    
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/templates`, { params: { toolId, scanType } })
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          this.setState({ templateList: res.data.entity || [] });
        }
      })
      .catch(() => console.error('加载模板列表失败'));
  };

  // 校验开始时间 - 智能调度模式：获取实际执行时间
  validateStartTime = (startTime, overrideConfig = null, showModal = false) => {
    const { activeTab, configData } = this.state;
    // 使用传入的配置覆盖，或者使用 state 中的配置
    const config = overrideConfig || configData;
    return request('post', `${dataJson[0].satpwebapi}/api/auto-scan/validate/start-time`, {
      scanType: activeTab,
      startTime: startTime,
      scanDay: config.scanDay,
      blindTimeInterval: config.blindTimeInterval,
      blindTimeList: config.blindTimeList
    }).then(res => {
      if (res.data && res.data.entity) {
        const result = res.data.entity;
        if (result.adjusted) {
          // 时间被调整，显示警告提示
          this.setState({
            startTimeValidateStatus: 'warning',
            startTimeValidateHelp: result.message,
            nextExecTimeInfo: {
              expectedTime: result.expectedTime,
              actualTime: result.actualTime,
              adjusted: result.adjusted,
              adjustReason: result.adjustReason,
              nextExecTime: result.nextExecTime
            }
          });
          // 如果需要显示弹框提示
          if (showModal) {
            Modal.warning({
              title: '执行时间已自动调整',
              content: (
                <div>
                  <p>{result.adjustReason}</p>
                  <p style={{ marginTop: 8, fontWeight: 'bold' }}>
                    实际执行时间：{result.nextExecTime}
                  </p>
                </div>
              ),
              okText: '知道了'
            });
          }
        } else {
          // 时间未调整，清除提示
          this.setState({
            startTimeValidateStatus: '',
            startTimeValidateHelp: '',
            nextExecTimeInfo: {
              expectedTime: result.expectedTime,
              actualTime: result.actualTime,
              adjusted: false,
              nextExecTime: result.nextExecTime
            }
          });
        }
        return true;  // 智能调度模式：始终返回true，不阻断
      }
      return true;
    }).catch(() => {
      // 接口调用失败时不阻止操作
      return true;
    });
  };

  // 校验盲时配置是否有效
  validateBlindTimeConfig = (blindTimeList) => {
    const { activeTab, configData } = this.state;
    console.log('[validateBlindTimeConfig] configData:', configData);
    console.log('[validateBlindTimeConfig] startTime 原始值:', configData.startTime, '类型:', typeof configData.startTime);
    const params = {
      scanType: activeTab,
      scanDay: configData.scanDay || 1,
      startTime: configData.startTime !== null && configData.startTime !== undefined ? configData.startTime : 0,
      blindTimeList: blindTimeList
    };
    console.log('[validateBlindTimeConfig] 请求参数:', params);
    return request('post', `${dataJson[0].satpwebapi}/api/auto-scan/validate/blind-time`, params).then(res => {
      if (res.data && res.data.entity && !res.data.entity.valid) {
        message.error(res.data.entity.errorMessage || '盲时配置过多，无法找到可执行时间，请调整配置');
        return false;
      }
      return true;
    }).catch(() => {
      // 接口调用失败时不阻止操作
      return true;
    });
  };

  // 开始时间变化处理
  handleStartTimeChange = (startTime) => {
    this.handleFormChange({ startTime }, {});
    // 校验开始时间是否在盲时范围内，显示弹框提示
    if (startTime !== null && startTime !== undefined) {
      this.validateStartTime(startTime, null, true);
    }
  };

  // Tab切换
  handleTabChange = (key) => {
    if (this.state.hasChanges) {
      Modal.confirm({
        title: '提示',
        content: '当前配置有未保存的修改，是否保存？',
        okText: '保存',
        cancelText: '不保存',
        onOk: () => {
          this.handleSave().then(() => {
            this.switchTab(key);
          });
        },
        onCancel: () => {
          this.switchTab(key);
        }
      });
    } else {
      this.switchTab(key);
    }
  };

  switchTab = (key) => {
    this.setState({ 
      activeTab: key,
      templateList: [],
      hasChanges: false
    }, () => {
      this.loadConfig(key);
      this.loadToolList(key);
    });
  };

  // 工具选择变化
  handleToolChange = (toolId) => {
    const { activeTab } = this.state;
    this.setState({ 
      configData: { ...this.state.configData, toolId, templateId: null },
      hasChanges: true 
    });
    if (toolId) {
      this.loadTemplateList(toolId, activeTab);
    } else {
      this.setState({ templateList: [] });
    }
  };

  // 表单值变化
  handleFormChange = (changedValues) => {
    this.setState({ 
      configData: { ...this.state.configData, ...changedValues },
      hasChanges: true 
    }, () => {
      // 如果扫描日期变化，重新校验开始时间
      if (changedValues.scanDay !== undefined) {
        const { configData } = this.state;
        if (configData.startTime !== null && configData.startTime !== undefined) {
          this.validateStartTime(configData.startTime, null, true);
        }
      }
    });
  };

  // 盲时配置变化
  handleBlindTimeChange = (blindTimeList) => {
    const { configData } = this.state;
    this.setState({
      configData: { ...configData, blindTimeList },
      hasChanges: true
    }, () => {
      // 盲时配置变化时，重新校验当前选择的开始时间，显示弹框提示
      const { configData: updatedConfig } = this.state;
      if (updatedConfig.startTime !== null && updatedConfig.startTime !== undefined) {
        this.validateStartTime(updatedConfig.startTime, null, true);
      }
    });
  };

  // 开关切换
  handleEnableChange = async (checked) => {
    const { activeTab, configData, templateList } = this.state;
    
    if (checked) {
      // PRD §10.3 要求：开启前检查配置是否完整，校验所有必填项
      const missingFields = [];
      
      if (!configData.scanDay) missingFields.push('每月开始扫描日期');
      // startTime 允许值为0（0点），需特殊处理
      if (configData.startTime === null || configData.startTime === undefined) missingFields.push('开始时间');
      if (!configData.maxAssetPerTask) missingFields.push('单个任务下发最大资产数');
      if (!configData.timeoutHours) missingFields.push('任务超时最大等待时间');
      if (!configData.createUserId) missingFields.push('自动任务创建用户');
      if (!configData.toolId) missingFields.push('扫描工具');
      if (!configData.systemIds?.length) missingFields.push('业务系统');
      // 校验资产范围
      if (!configData.assetScope) missingFields.push('资产范围');
      // 校验合规模板（仅当工具有可选模板时）
      if (templateList.length > 0 && !configData.templateId) missingFields.push('合规模板');
      
      if (missingFields.length > 0) {
        message.warning(`请先完善配置：${missingFields.join('、')}`);
        return;
      }
    }

    Modal.confirm({
      title: checked ? '确认开启' : '确认关闭',
      content: checked 
        ? '开启后将按配置自动下发扫描任务' 
        : '关闭后将取消待执行的自动调度任务，已有的手动调度任务不受影响',
      onOk: () => {
        request('put', `${dataJson[0].satpwebapi}/api/auto-scan/config/${activeTab}/enable`, { enabled: checked })
          .then(res => {
            if (res.data && res.data.success) {
              message.success(checked ? '已开启自动下发' : '已关闭自动下发');
              this.setState({
                configData: { ...this.state.configData, isEnabled: checked }
              });
            } else {
              message.error(res.data?.message || '操作失败');
            }
          })
          .catch(() => {
            message.error('操作失败');
          });
      }
    });
  };

  // 保存配置
  handleSave = () => {
    return new Promise((resolve, reject) => {
      const { configData } = this.state;

      this.formRef.current.validateFields()
        .then(async (values) => {
          const { activeTab } = this.state;
          
          // 校验盲时配置是否有效
          const blindTimeValid = await this.validateBlindTimeConfig(configData.blindTimeList);
          if (!blindTimeValid) {
            reject();
            return;
          }

          // 转换数据类型：Boolean -> Integer
          const saveData = {
            ...values,
            // isEnabled 不在 values 中，从 configData 获取
            isEnabled: configData.isEnabled ? 1 : 0,
            saveRawResult: values.saveRawResult ? 1 : 0,
            blindTimeList: configData.blindTimeList,
            // TreeSelect treeCheckStrictly 模式下 systemIds 是 {value,label} 对象数组，需转回纯ID数组
            systemIds: values.systemIds 
              ? values.systemIds.map(v => v.value || v) 
              : configData.systemIds || []
          };

          this.setState({ saving: true });
          request('post', `${dataJson[0].satpwebapi}/api/auto-scan/config/${activeTab}`, saveData)
            .then(res => {
              if (res.data && res.data.success) {
                message.success('保存成功');
                this.setState({ 
                  hasChanges: false,
                  configData: { 
                    ...this.state.configData, 
                    nextExecTime: res.data.nextExecTime 
                  }
                });
                resolve();
              } else {
                message.error(res.data?.message || '保存失败');
                reject();
              }
            })
            .catch(() => {
              message.error('保存失败');
              reject();
            })
            .finally(() => {
              this.setState({ saving: false });
            });
        })
        .catch(() => {
          reject();
        });
    });
  };

  // 打开手动触发弹框
  showManualTriggerModal = () => {
    this.setState({ manualTriggerVisible: true });
  };

  // 打开轮次跟踪弹框
  showRoundTrackingModal = () => {
    this.setState({ roundTrackingVisible: true });
  };

  // 获取当前月份的天数
  getDaysInCurrentMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  };

  // 生成日期选项（根据当前月份动态生成）
  renderDayOptions = () => {
    const daysInMonth = this.getDaysInCurrentMonth();
    return Array.from({ length: daysInMonth }, (_, i) => (
      <Select.Option key={i + 1} value={i + 1}>{i + 1}号</Select.Option>
    ));
  };

  // 生成小时选项 0-23
  renderHourOptions = () => {
    return Array.from({ length: 24 }, (_, i) => (
      <Select.Option key={i} value={i}>{i < 10 ? `0${i}` : i}:00</Select.Option>
    ));
  };

  render() {
    const { 
      locationVal, activeTab, loading, saving, configData,
      userList, systemTreeData, toolList, templateList,
      manualTriggerVisible, roundTrackingVisible,
      startTimeValidateStatus, startTimeValidateHelp,
      nextExecTimeInfo
    } = this.state;

    const currentScanType = SCAN_TYPES[activeTab];

    return (
      <div className="page-warp auto-scan-config">
        <Address locationVal={locationVal} />
        
        {/* Tab切换 */}
        <Tabs activeKey={activeTab} onChange={this.handleTabChange} className="scan-type-tabs">
          {Object.values(SCAN_TYPES).map(type => (
            <TabPane tab={type.label} key={type.key} />
          ))}
        </Tabs>

        <Spin spinning={loading}>
          {/* 操作按钮栏 */}
          <div className="toolbar clearfix">
            <Button type="primary" onClick={this.showRoundTrackingModal}>
              自动扫描情况跟踪
            </Button>
            <Button style={{ marginLeft: 16 }} onClick={this.showManualTriggerModal}>
              下发新一轮次任务
            </Button>
            <div style={{ float: 'right', textAlign: 'right', lineHeight: '32px' }}>
              {nextExecTimeInfo?.adjusted ? (
                // 时间被调整时，只显示红框提示
                <span style={{ 
                  color: '#ff4d4f', 
                  padding: '4px 12px',
                  backgroundColor: '#fff2f0',
                  border: '1px solid #ffccc7',
                  borderRadius: 4
                }}>
                  {nextExecTimeInfo.adjustReason}
                </span>
              ) : (
                // 时间未调整时，显示下次执行时间
                (nextExecTimeInfo?.nextExecTime || configData.nextExecTime) && (
                  <span>
                    下次执行时间：{nextExecTimeInfo?.nextExecTime || configData.nextExecTime}
                  </span>
                )
              )}
            </div>
          </div>

          <Form
            ref={this.formRef}
            layout="horizontal"
            labelCol={{ span: 6 }}
            wrapperCol={{ span: 16 }}
            onValuesChange={this.handleFormChange}
            initialValues={configData}
            className="config-form"
          >
            {/* 自动下发开关 */}
            <div className="config-section">
              <div className="section-title">自动下发开关</div>
              <div className="section-content">
                <Form.Item label="是否开启" name="isEnabled">
                  <Switch 
                    checked={configData.isEnabled}
                    checkedChildren="开启" 
                    unCheckedChildren="关闭"
                    onChange={this.handleEnableChange}
                  />
                </Form.Item>
              </div>
            </div>

            {/* 自动下发时间（盲时配置） */}
            <div className="config-section">
              <div className="section-title">自动下发时间（业务系统忙时）</div>
              <div className="section-content">
                <Form.Item 
                  label="下发任务距离忙时间隔" 
                  name="blindTimeInterval"
                  extra="单位：小时，距离忙时开始前X小时内不下发任务"
                >
                  <InputNumber min={0} max={24} style={{ width: 200 }} />
                </Form.Item>

                <Form.Item label="盲时配置">
                  <BlindTimeTable 
                    value={configData.blindTimeList}
                    onChange={this.handleBlindTimeChange}
                  />
                </Form.Item>
              </div>
            </div>

            {/* 自动下发参数 */}
            <div className="config-section">
              <div className="section-title">自动下发参数</div>
              <div className="section-content">
                <Form.Item 
                  label="每月开始扫描日期" 
                  name="scanDay"
                  rules={[{ required: true, message: '请选择每月开始扫描日期' }]}
                >
                  <Select placeholder="请选择" style={{ width: 200 }}>
                    {this.renderDayOptions()}
                  </Select>
                </Form.Item>

                <Form.Item 
                  label="开始时间" 
                  name="startTime"
                  rules={[{ required: true, message: '请选择开始时间' }]}
                  validateStatus={startTimeValidateStatus}
                  help={startTimeValidateHelp}
                >
                  <Select 
                    placeholder="请选择" 
                    style={{ width: 200 }}
                    onChange={this.handleStartTimeChange}
                  >
                    {this.renderHourOptions()}
                  </Select>
                </Form.Item>

                <Form.Item 
                  label="单个任务下发最大资产数" 
                  name="maxAssetPerTask"
                  rules={[{
                    required: true,
                    validator: (_, value) => {
                      if (value === null || value === undefined || value === '') {
                        return Promise.reject('请输入1-500之间的数字');
                      }
                      if (value < 1 || value > 500) {
                        return Promise.reject('请输入1-500之间的数字');
                      }
                      return Promise.resolve();
                    }
                  }]}
                >
                  <InputNumber min={1} max={500} style={{ width: 200 }} />
                </Form.Item>

                <Form.Item 
                  label="任务超时最大等待时间" 
                  name="timeoutHours"
                  rules={[{
                    required: true,
                    validator: (_, value) => {
                      if (value === null || value === undefined || value === '') {
                        return Promise.reject('请输入1-10之间的数字');
                      }
                      if (value < 1 || value > 10) {
                        return Promise.reject('请输入1-10之间的数字');
                      }
                      return Promise.resolve();
                    }
                  }]}
                  extra="单位：小时，等待上一轮任务完成的最大时长"
                >
                  <InputNumber min={1} max={10} style={{ width: 200 }} />
                </Form.Item>

                <Form.Item 
                  label="自动任务创建用户" 
                  name="createUserId"
                  rules={[{ required: true, message: '请选择自动任务创建用户' }]}
                >
                  <Select placeholder="请选择" style={{ width: 200 }} allowClear>
                    {userList.map(user => (
                      <Select.Option key={user.id} value={user.id}>{user.name}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            </div>

            {/* 自动下发资产范围 */}
            <div className="config-section">
              <div className="section-title">自动下发资产范围</div>
              <div className="section-content">
                <Form.Item 
                  label="选择资产范围" 
                  name="assetScope"
                  rules={[{ required: true, message: '请选择资产范围' }]}
                >
                  <Radio.Group>
                    <Radio value="all">全部资产</Radio>
                    <Radio value="reported">仅上报资产</Radio>
                    <Radio value="unreported">非上报资产</Radio>
                  </Radio.Group>
                </Form.Item>

                {activeTab === 'ext_vuln' && (
                  <Alert
                    type="info"
                    showIcon
                    message="外部漏洞扫描仅针对应用类型资产，无应用资产的业务系统将自动跳过"
                    style={{ marginBottom: 16 }}
                  />
                )}
                <Form.Item 
                  label="选择业务系统范围" 
                  name="systemIds"
                  rules={[{ required: true, message: '请选择业务系统' }]}
                >
                  <TreeSelect
                    treeData={systemTreeData}
                    multiple
                    treeCheckable
                    treeCheckStrictly
                    showCheckedStrategy={TreeSelect.SHOW_ALL}
                    placeholder="请选择业务系统"
                    style={{ width: '100%' }}
                    maxTagCount={5}
                    maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}个`}
                    showSearch
                    treeNodeFilterProp="title"
                    filterTreeNode={(inputValue, treeNode) => {
                      return treeNode.title.toLowerCase().includes(inputValue.toLowerCase());
                    }}
                    onChange={(value) => {
                      // TreeSelect treeCheckStrictly 模式返回 {value, label} 对象数组
                      const ids = value.map(v => v.value || v);
                      // 同时更新 Form 和 state
                      if (this.formRef.current) {
                        this.formRef.current.setFieldsValue({ systemIds: ids });
                      }
                      this.handleFormChange({ systemIds: ids });
                    }}
                  />
                </Form.Item>
              </div>
            </div>

            {/* 自动下发模式 */}
            <div className="config-section">
              <div className="section-title">自动下发模式</div>
              <div className="section-content">
                <Form.Item 
                  label="选择工具" 
                  name="toolId"
                  rules={[{ required: true, message: '请选择扫描工具' }]}
                >
                  <ToolCardSelect 
                    tools={toolList}
                    value={configData.toolId}
                    onChange={this.handleToolChange}
                  />
                </Form.Item>

                <Form.Item 
                  label="合规模板" 
                  name="templateId"
                  rules={templateList.length > 0 ? [{ required: true, message: '请选择模板' }] : []}
                  extra={templateList.length === 0 && configData.toolId ? '该工具使用内置默认模板' : ''}
                >
                  <Select 
                    placeholder={templateList.length === 0 ? '该工具使用内置默认模板' : '请选择模板'}
                    style={{ width: 300 }}
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    disabled={templateList.length === 0}
                    dropdownMatchSelectWidth={false}
                    dropdownStyle={{ minWidth: 300 }}
                  >
                    {templateList.map(tpl => (
                      <Select.Option key={tpl.id} value={tpl.id}>
                        <Tooltip title={tpl.description}>{tpl.name}</Tooltip>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                {currentScanType.showRawResult && (
                  <Form.Item 
                    label="保存原始结果" 
                    name="saveRawResult"
                    valuePropName="checked"
                  >
                    <Checkbox>保存原始结果</Checkbox>
                  </Form.Item>
                )}
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="form-actions">
              <Button type="primary" onClick={this.handleSave} loading={saving}>
                保存配置
              </Button>
            </div>
          </Form>
        </Spin>

        {/* 手动触发弹框 */}
        <ManualTriggerModal
          visible={manualTriggerVisible}
          scanType={activeTab}
          onCancel={() => this.setState({ manualTriggerVisible: false })}
          onSuccess={() => {
            this.setState({ manualTriggerVisible: false });
            this.loadConfig(activeTab);
          }}
        />

        {/* 轮次跟踪弹框 */}
        <RoundTrackingModal
          visible={roundTrackingVisible}
          scanType={activeTab}
          onCancel={() => this.setState({ roundTrackingVisible: false })}
        />
      </div>
    );
  }
}

export default AutoScanConfig;

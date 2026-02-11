import React, { Component } from 'react';
import { Modal, Form, DatePicker, Checkbox, Button, message, Spin } from 'antd';
import { request } from 'smart-frame';
import dataJson from '@/config/dataJson';
import moment from 'moment';

class ManualTriggerModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      submitting: false,
      assetScope: ['all'],
      scheduleTime: null,
      canExecuteInfo: null,
      // 已存在的pending手动调度
      existingPendingRound: null
    };
  }

  componentDidUpdate(prevProps) {
    if (this.props.visible && !prevProps.visible) {
      // 弹框打开时，检查是否可以立即执行
      this.checkCanExecute();
      this.setState({
        assetScope: ['all'],
        scheduleTime: null
      });
    }
  }

  // 检查是否可以立即执行 - 同时获取已存在的pending手动调度
  checkCanExecute = () => {
    const { scanType } = this.props;
    this.setState({ loading: true });
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/validate/can-execute`, { params: { scanType } })
      .then(res => {
        if (res.data) {
          const entity = res.data.entity || res.data;
          this.setState({ 
            canExecuteInfo: entity,
            existingPendingRound: entity.existingPendingRound || null
          });
        }
      })
      .catch(() => console.error('检查执行状态失败'))
      .finally(() => {
        this.setState({ loading: false });
      });
  };

  // 获取最新的可执行状态（用于提交时重新校验，PRD §8.5.4）
  fetchCanExecuteInfo = () => {
    const { scanType } = this.props;
    return request('get', `${dataJson[0].satpwebapi}/api/auto-scan/validate/can-execute`, { params: { scanType } })
      .then(res => {
        if (res.data) {
          return res.data.entity || res.data;
        }
        return null;
      })
      .catch(() => null);
  };

  // 校验定时时间是否在盲时内或距盲时间隔内
  validateScheduleTime = (time) => {
    const { scanType } = this.props;
    if (!time) return Promise.resolve({ valid: true });

    return request('post', `${dataJson[0].satpwebapi}/api/auto-scan/validate/schedule-time`, {
      scanType,
      scheduleTime: time.format('YYYY-MM-DD HH:mm')
    }).then(res => {
      const entity = res.data && res.data.entity ? res.data.entity : res.data;
      if (entity && !entity.valid) {
        // 根据PRD要求显示不同的提示信息
        if (entity.inBlindTime) {
          message.warning('所选时间在盲时范围内，请重新选择');
        } else if (entity.nearBlindTime) {
          message.warning(entity.message || '所选时间距离盲时不足，请重新选择');
        } else {
          message.warning(entity.message);
        }
        return { valid: false };
      }
      return { valid: true };
    }).catch(() => {
      return { valid: true }; // 接口失败时不阻止操作
    });
  };

  // 资产范围选择变化 - 按PRD要求：选择"全部"时，其他两项置灰不可选
  handleAssetScopeChange = (checkedValues) => {
    // 选择"全部"时，其他选项置灰
    if (checkedValues.includes('all') && !this.state.assetScope.includes('all')) {
      this.setState({ assetScope: ['all'] });
    } else if (checkedValues.includes('all') && checkedValues.length > 1) {
      // 已选"全部"，又选了其他，则取消"全部"
      this.setState({ assetScope: checkedValues.filter(v => v !== 'all') });
    } else {
      this.setState({ assetScope: checkedValues });
    }
  };

  // 执行提交
  doSubmit = (cancelPending = false) => {
    const { scanType, onSuccess } = this.props;
    const { assetScope, scheduleTime, existingPendingRound } = this.state;

    // 构建请求参数
    let assetScopeValue = 'all';
    if (assetScope.includes('all')) {
      assetScopeValue = 'all';
    } else if (assetScope.includes('failed') && assetScope.includes('unscanned')) {
      assetScopeValue = 'failed_and_unscanned';
    } else if (assetScope.includes('failed')) {
      assetScopeValue = 'failed';
    } else if (assetScope.includes('unscanned')) {
      assetScopeValue = 'unscanned';
    }

    const params = {
      scanType: scanType,
      assetScope: assetScopeValue,
      cancelPending: cancelPending,
      existingPendingRoundId: existingPendingRound?.id
    };
    if (scheduleTime) {
      params.scheduleTime = scheduleTime.format('YYYY-MM-DD HH:mm');
    }

    this.setState({ submitting: true });
    request('post', `${dataJson[0].satpwebapi}/api/auto-scan/rounds/manual`, params)
      .then(res => {
        if (res.data && res.data.success) {
          message.success(scheduleTime ? '定时任务创建成功' : '任务已开始执行');
          onSuccess && onSuccess();
        } else {
          message.error(res.data?.message || '操作失败');
        }
      })
      .catch(() => {
        message.error('操作失败');
      })
      .finally(() => {
        this.setState({ submitting: false });
      });
  };

  // 提交处理 - 按PRD要求处理存在pending时的交互规则
  handleSubmit = async () => {
    const { assetScope, scheduleTime, existingPendingRound } = this.state;

    // 校验资产范围
    if (assetScope.length === 0) {
      message.warning('请选择资产范围');
      return;
    }

    // PRD §8.5.4 要求：点击确认时重新调用后端接口校验
    const latestCanExecuteInfo = await this.fetchCanExecuteInfo();
    if (!latestCanExecuteInfo) {
      message.error('校验执行状态失败，请重试');
      return;
    }

    // 校验是否存在waiting/running状态的轮次（使用最新状态）
    if (latestCanExecuteInfo.hasRunningRound) {
      message.warning('当前存在执行中的调度，请等待完成后再操作');
      return;
    }

    // 场景A：选择定时时间
    if (scheduleTime) {
      // 校验定时时间是否在盲时内或距盲时间隔内
      const validation = await this.validateScheduleTime(scheduleTime);
      if (!validation.valid) {
        return;
      }

      // 存在pending手动调度时的处理
      if (existingPendingRound) {
        const originalMonth = moment(existingPendingRound.planStartTime).format('YYYYMM');
        const newMonth = scheduleTime.format('YYYYMM');
        
        if (originalMonth !== newMonth) {
          // 跨月提示
          Modal.confirm({
            title: '提示',
            content: `执行时间已跨月，轮次编号将更新为${newMonth.slice(0, 4)}-${newMonth.slice(4)}的轮次`,
            okText: '确定',
            cancelText: '取消',
            onOk: () => this.doSubmit(false)
          });
          return;
        }
        // 同月直接更新，提示用户
        message.info('已更新原定时任务的执行时间');
      }
      
      this.doSubmit(false);
      return;
    }

    // 场景B：立即执行
    // 校验当前时间是否在盲时内或距盲时过近（使用最新状态）
    if (!latestCanExecuteInfo.canExecute) {
      if (latestCanExecuteInfo.inBlindTime) {
        message.warning('当前处于盲时，请选择定时执行时间');
      } else if (latestCanExecuteInfo.nearBlindTime) {
        message.warning(latestCanExecuteInfo.message || '当前距离盲时不足，请选择定时执行时间');
      } else {
        message.warning(latestCanExecuteInfo.message || '当前无法立即执行，请选择定时执行时间');
      }
      return;
    }

    // 存在pending手动调度时立即执行的确认
    if (existingPendingRound) {
      Modal.confirm({
        title: '确认',
        content: '当前存在待执行的定时任务，立即执行将取消该定时任务并创建新任务，是否继续？',
        okText: '确定',
        cancelText: '取消',
        onOk: () => this.doSubmit(true) // 取消原pending并创建新记录
      });
      return;
    }

    // 无pending情况，直接执行
    this.doSubmit(false);
  };

  render() {
    const { visible, onCancel } = this.props;
    const { loading, submitting, assetScope, scheduleTime, canExecuteInfo, existingPendingRound } = this.state;

    const isAllSelected = assetScope.includes('all');

    return (
      <Modal
        title="下发新一轮次任务"
        visible={visible}
        onCancel={onCancel}
        width={700}
        className="manual-trigger-modal"
        bodyStyle={{ padding: '24px' }}
        footer={[
          <Button key="cancel" onClick={onCancel}>取消</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={this.handleSubmit}>
            确认
          </Button>
        ]}
        destroyOnClose
      >
        <Spin spinning={loading}>
          <Form layout="horizontal" labelCol={{ flex: '100px' }} wrapperCol={{ flex: 1 }}>
            <Form.Item 
              label="定时开始时间" 
              extra="不选择则立即执行"
            >
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                placeholder="选择时间（可不选）"
                value={scheduleTime}
                onChange={(time) => {
                  this.setState({ scheduleTime: time });
                  if (time) {
                    this.validateScheduleTime(time);
                  }
                }}
                disabledDate={(current) => current && current < moment().startOf('day')}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item label="选择资产范围">
              <Checkbox.Group
                value={assetScope}
                onChange={this.handleAssetScopeChange}
                className="asset-scope-group"
              >
                <Checkbox value="all">全部</Checkbox>
                <Checkbox value="failed" disabled={isAllSelected}>上次扫描失败资产</Checkbox>
                <Checkbox value="unscanned" disabled={isAllSelected}>本轮未扫描到的资产</Checkbox>
              </Checkbox.Group>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                提示："上次扫描失败资产"和"本轮未扫描到的资产"可同时勾选，取并集
              </div>
            </Form.Item>

            {/* 存在执行中的调度提示 */}
            {canExecuteInfo && canExecuteInfo.hasRunningRound && (
              <div style={{ color: '#faad14', marginBottom: 16 }}>
                提示：当前存在执行中的调度，请等待完成后再操作
              </div>
            )}

            {/* 存在待执行的定时任务提示 */}
            {existingPendingRound && (
              <div style={{ color: '#1890ff', marginBottom: 16 }}>
                提示：当前存在待执行的定时任务（计划时间：{existingPendingRound.planStartTime}）
              </div>
            )}

            {/* 盲时提示 - 仅在立即执行时显示 */}
            {canExecuteInfo && (canExecuteInfo.inBlindTime || canExecuteInfo.nearBlindTime) && !scheduleTime && (
              <div style={{ color: '#ff4d4f', marginBottom: 16 }}>
                {canExecuteInfo.inBlindTime 
                  ? '当前处于盲时，请选择定时执行时间'
                  : (canExecuteInfo.message || '当前距离盲时过近，请选择定时执行时间')}
              </div>
            )}
          </Form>
        </Spin>
      </Modal>
    );
  }
}

export default ManualTriggerModal;

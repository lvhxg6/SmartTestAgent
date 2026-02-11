import React, { Component } from 'react';
import { Modal, Select, DatePicker, Table, Tag, Button, Tooltip, Space, TreeSelect, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { request } from 'smart-frame';
import dataJson from '@/config/dataJson';
import moment from 'moment';
import RoundDetailModal from './RoundDetailModal';

const { MonthPicker } = DatePicker;

// 状态配置 - 按PRD要求的颜色规范
const STATUS_CONFIG = {
  pending: { text: '待执行', color: 'default' },      // 灰色
  waiting: { text: '等待中', color: 'processing' },   // 蓝色
  running: { text: '执行中', color: 'processing' },   // 蓝色
  success: { text: '成功', color: 'success' },        // 绿色
  failed: { text: '失败', color: 'error' },           // 红色
  partial_failed: { text: '部分失败', color: 'warning' }, // 橙色
  skipped: { text: '已跳过', color: 'default' }       // 灰色
};

// 自动刷新间隔（毫秒）
const AUTO_REFRESH_INTERVAL = 30000;

class RoundTrackingModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      dataSource: [],
      pagination: {
        current: 1,
        pageSize: 10,
        total: 0
      },
      filters: {
        taskVersion: null,
        systemId: null,
        status: null
      },
      systemList: [],
      // 明细弹框
      detailVisible: false,
      currentRound: null,
      // 自动刷新定时器
      refreshTimer: null
    };
  }

  componentDidUpdate(prevProps) {
    if (this.props.visible && !prevProps.visible) {
      // 弹框打开时加载数据并启动自动刷新
      this.loadData();
      this.loadSystemList();
      this.startAutoRefresh();
    }
    if (!this.props.visible && prevProps.visible) {
      // 弹框关闭时停止自动刷新
      this.stopAutoRefresh();
    }
  }

  componentWillUnmount() {
    // 组件卸载时清理定时器
    this.stopAutoRefresh();
  }

  // 启动自动刷新
  startAutoRefresh = () => {
    this.stopAutoRefresh();
    const timer = setInterval(() => {
      this.loadData(this.state.pagination.current);
    }, AUTO_REFRESH_INTERVAL);
    this.setState({ refreshTimer: timer });
  };

  // 停止自动刷新
  stopAutoRefresh = () => {
    if (this.state.refreshTimer) {
      clearInterval(this.state.refreshTimer);
      this.setState({ refreshTimer: null });
    }
  };

  // 加载轮次列表
  loadData = (page = 1) => {
    const { scanType } = this.props;
    const { pagination, filters } = this.state;

    this.setState({ loading: true });

    const params = {
      scanType,
      pageNum: page,
      pageSize: pagination.pageSize,
      ...filters
    };

    // 移除空值
    Object.keys(params).forEach(key => {
      if (params[key] === null || params[key] === undefined || params[key] === '') {
        delete params[key];
      }
    });

    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/rounds`, { params })
      .then(res => {
        if (res.data) {
          // ResponseEntity<PageData> 返回的直接是 PageData 结构
          const data = res.data.entity || res.data;
          const list = data.data || data.list || [];
          const total = data.rowCount || data.total || 0;
          this.setState({
            dataSource: list,
            pagination: {
              ...pagination,
              current: page,
              total
            }
          });
        }
      })
      .catch(() => {
        console.error('加载轮次列表失败');
        message.error('加载数据失败');
      })
      .finally(() => {
        this.setState({ loading: false });
      });
  };

  // 加载业务系统列表（用于筛选）
  loadSystemList = () => {
    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/systems`, {})
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          const treeData = this.transformTreeData(res.data.entity || []);
          this.setState({ systemList: treeData });
        }
      })
      .catch(() => console.error('加载业务系统失败'));
  };

  // 转换树形数据
  transformTreeData = (data) => {
    return data.map(item => ({
      title: item.systemName || item.name,
      value: item.id,
      key: item.id,
      children: item.children ? this.transformTreeData(item.children) : []
    }));
  };

  // 筛选条件变化
  handleFilterChange = (key, value) => {
    this.setState({
      filters: {
        ...this.state.filters,
        [key]: value
      }
    }, () => {
      this.loadData(1);
    });
  };

  // 分页变化
  handleTableChange = (pagination) => {
    this.loadData(pagination.current);
  };

  // 查看明细
  showDetail = (record) => {
    this.setState({
      detailVisible: true,
      currentRound: record
    });
  };

  // 手动刷新 - 重置自动刷新计时器
  handleRefresh = () => {
    this.loadData(this.state.pagination.current);
    this.startAutoRefresh(); // 重置自动刷新计时器
  };

  // 渲染执行时间 - 按PRD要求的展示规则
  renderExecTime = (record) => {
    const { status, planStartTime, actualStartTime } = record;
    
    switch (status) {
      case 'pending':
        // pending状态：显示"计划：{plan_start_time}"
        return planStartTime ? `计划：${planStartTime}` : '-';
      case 'waiting':
        // waiting状态：显示"-"
        return '-';
      default:
        // 其他状态：显示actual_start_time
        return actualStartTime || '-';
    }
  };

  // 渲染目标名称（带Tooltip）
  renderTargetNames = (record) => {
    const { targetSystemCount, targetSystemNames = [] } = record;
    if (!targetSystemCount) return '-';

    return (
      <Tooltip
        title={
          <div>
            {targetSystemNames.map((name, idx) => (
              <div key={idx}>{name}</div>
            ))}
          </div>
        }
      >
        <span style={{ cursor: 'pointer' }}>共{targetSystemCount}个业务系统</span>
      </Tooltip>
    );
  };

  // 渲染失败业务系统（带Tooltip）
  renderFailedSystems = (record) => {
    const { failedSystemCount, failedSystemNames = [] } = record;
    if (!failedSystemCount) return '-';

    return (
      <Tooltip
        title={
          <div>
            {failedSystemNames.map((name, idx) => (
              <div key={idx}>{name}</div>
            ))}
          </div>
        }
      >
        <span style={{ cursor: 'pointer', color: '#ff4d4f' }}>共{failedSystemCount}个</span>
      </Tooltip>
    );
  };

  render() {
    const { visible, onCancel } = this.props;
    const { 
      loading, dataSource, pagination, filters, systemList,
      detailVisible, currentRound 
    } = this.state;

    // 过滤cancelled状态的数据（PRD §4.3 要求cancelled不展示）
    const filteredDataSource = dataSource.filter(item => item.status !== 'cancelled');

    const columns = [
      {
        title: '序号',
        dataIndex: 'index',
        width: 60,
        render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1
      },
      {
        title: '月份',
        dataIndex: 'taskVersion',
        width: 100,
        render: (text) => text ? `${text.slice(0, 4)}-${text.slice(4)}` : '-'
      },
      {
        title: '执行轮次',
        dataIndex: 'roundTag',
        width: 150
      },
      {
        title: '目标名称',
        dataIndex: 'targetSystemCount',
        render: (_, record) => this.renderTargetNames(record)
      },
      {
        title: '失败业务系统',
        dataIndex: 'failedSystemCount',
        width: 120,
        render: (_, record) => this.renderFailedSystems(record)
      },
      {
        title: '执行时间',
        dataIndex: 'execTime',
        width: 200,
        render: (_, record) => this.renderExecTime(record)
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (status) => {
          const config = STATUS_CONFIG[status] || { text: status, color: 'default' };
          return <Tag color={config.color}>{config.text}</Tag>;
        }
      },
      {
        title: '操作',
        width: 100,
        render: (_, record) => {
          // pending/skipped/cancelled 状态无明细链接
          if (['pending', 'skipped', 'cancelled'].includes(record.status)) {
            return '-';
          }
          return (
            <a onClick={() => this.showDetail(record)}>查看明细</a>
          );
        }
      }
    ];

    return (
      <>
        <Modal
          title="自动扫描情况跟踪"
          visible={visible}
          onCancel={onCancel}
          width={1200}
          className="round-tracking-modal"
          bodyStyle={{ padding: '16px 24px' }}
          footer={[
            <Button key="close" onClick={onCancel}>关闭</Button>
          ]}
          destroyOnClose
        >
          {/* 查询条件 */}
          <div className="query-form" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px' }}>
              <span>月份：</span>
              <MonthPicker
                value={filters.taskVersion ? moment(filters.taskVersion, 'YYYYMM') : null}
                format="YYYY-MM"
                placeholder="选择月份"
                style={{ width: 140 }}
                onChange={(date) => {
                  this.handleFilterChange('taskVersion', date ? date.format('YYYYMM') : null);
                }}
                allowClear
              />

              <span>业务系统：</span>
              <TreeSelect
                value={filters.systemId}
                treeData={systemList}
                placeholder="选择业务系统"
                style={{ width: 200 }}
                onChange={(val) => this.handleFilterChange('systemId', val)}
                allowClear
                showSearch
                treeNodeFilterProp="title"
                dropdownStyle={{ maxHeight: 300, overflow: 'auto' }}
              />

              <span>状态：</span>
              <Select
                value={filters.status}
                placeholder="选择状态"
                style={{ width: 120 }}
                onChange={(val) => this.handleFilterChange('status', val)}
                allowClear
              >
                {/* PRD §8.3.2 要求：添加"全部"选项 */}
                <Select.Option key="all" value="">全部</Select.Option>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <Select.Option key={key} value={key}>{config.text}</Select.Option>
                ))}
              </Select>

              <Button icon={<ReloadOutlined />} onClick={this.handleRefresh}>
                刷新
              </Button>
          </div>

          {/* 数据表格 */}
          <Table
            columns={columns}
            dataSource={filteredDataSource}
            rowKey="id"
            loading={loading}
            pagination={{
              ...pagination,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`
            }}
            onChange={this.handleTableChange}
            size="middle"
          />
        </Modal>

        {/* 轮次明细弹框 */}
        <RoundDetailModal
          visible={detailVisible}
          round={currentRound}
          onCancel={() => this.setState({ detailVisible: false, currentRound: null })}
        />
      </>
    );
  }
}

export default RoundTrackingModal;

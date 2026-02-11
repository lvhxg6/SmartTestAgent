import React, { Component } from 'react';
import { Modal, Table, Tag, Button, Spin, message } from 'antd';
import { request } from 'smart-frame';
import dataJson from '@/config/dataJson';

// AMR任务状态配置 - 按PRD要求
const AMR_STATUS_CONFIG = {
  0: { text: '未开始', color: 'default' },
  1: { text: '进行中', color: 'processing' },
  2: { text: '已暂停', color: 'warning' },
  3: { text: '已终止', color: 'error' },
  9: { text: '已完成', color: 'success' },
  10: { text: '暂停中', color: 'warning' },
  11: { text: '终止中', color: 'error' }
};

class RoundDetailModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      dataSource: []
    };
  }

  componentDidUpdate(prevProps) {
    if (this.props.visible && !prevProps.visible && this.props.round) {
      this.loadDetail();
    }
  }

  // 加载轮次任务明细 - 包含AMR任务状态实时查询
  loadDetail = () => {
    const { round } = this.props;
    if (!round) return;

    this.setState({ loading: true });

    request('get', `${dataJson[0].satpwebapi}/api/auto-scan/rounds/${round.id}/tasks`, {})
      .then(res => {
        if (res.data && res.data.httpStatus === 200) {
          // entity 直接是数组
          const list = res.data.entity || [];
          // 任务状态、开始时间、结束时间通过AMR接口实时查询展示
          this.setState({ dataSource: list });
        }
      })
      .catch(() => {
        console.error('加载轮次明细失败');
        message.error('加载数据失败');
      })
      .finally(() => {
        this.setState({ loading: false });
      });
  };

  // 跳转到AMR任务详情
  goToAmrTask = (amrTaskId) => {
    if (amrTaskId) {
      // 跳转到AMR任务详情页面
      window.open(`/amr/task/detail/${amrTaskId}`, '_blank');
    }
  };

  render() {
    const { visible, round, onCancel } = this.props;
    const { loading, dataSource } = this.state;

    // 按PRD要求的列表字段：序号、业务系统名称、资产数、AMR任务名称、任务状态、开始时间、结束时间
    const columns = [
      {
        title: '序号',
        dataIndex: 'index',
        width: 60,
        render: (_, __, index) => index + 1
      },
      {
        title: '业务系统名称',
        dataIndex: 'systemName',
        width: 150
      },
      {
        title: '资产数',
        dataIndex: 'assetCount',
        width: 80
      },
      {
        title: 'AMR任务名称',
        dataIndex: 'amrTaskName',
        width: 200,
        ellipsis: true
      },
      {
        title: '任务状态',
        dataIndex: 'amrTaskStatus',
        width: 100,
        render: (status) => {
          const config = AMR_STATUS_CONFIG[status] || { text: '-', color: 'default' };
          return <Tag color={config.color}>{config.text}</Tag>;
        }
      },
      {
        title: '开始时间',
        dataIndex: 'amrTaskStartTime',
        width: 160,
        render: (text) => text || '-'
      },
      {
        title: '结束时间',
        dataIndex: 'amrTaskEndTime',
        width: 160,
        render: (text) => text || '-'
      },
      {
        title: '失败原因',
        dataIndex: 'failReason',
        width: 200,
        ellipsis: true,
        render: (text) => text || '-'
      }
    ];

    return (
      <Modal
        title="轮次执行明细"
        visible={visible}
        onCancel={onCancel}
        width={1200}
        className="round-detail-modal"
        bodyStyle={{ padding: '16px 24px' }}
        footer={[
          <Button key="close" onClick={onCancel}>关闭</Button>
        ]}
        destroyOnClose
      >
        <Spin spinning={loading}>
          {/* 轮次基本信息 */}
          {round && (
            <div className="detail-info" style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 4 }}>
              <span style={{ marginRight: 24 }}>
                <span style={{ color: '#666' }}>轮次标识：</span>
                <span>{round.roundTag}</span>
              </span>
              <span style={{ marginRight: 24 }}>
                <span style={{ color: '#666' }}>执行时间：</span>
                <span>{round.actualStartTime || round.planStartTime || '-'}</span>
              </span>
              <span>
                <span style={{ color: '#666' }}>状态：</span>
                <span>{round.statusText || round.status}</span>
              </span>
            </div>
          )}

          {/* 任务明细表格 */}
          <Table
            columns={columns}
            dataSource={dataSource}
            rowKey="id"
            pagination={false}
            size="middle"
            scroll={{ y: 400 }}
            locale={{ emptyText: '暂无任务明细' }}
          />
        </Spin>
      </Modal>
    );
  }
}

export default RoundDetailModal;

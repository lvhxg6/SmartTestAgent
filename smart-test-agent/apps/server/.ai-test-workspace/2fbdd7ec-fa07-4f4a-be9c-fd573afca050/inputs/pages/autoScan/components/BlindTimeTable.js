import React, { Component } from 'react';
import { Table, Button, Select, DatePicker, TimePicker, InputNumber, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import moment from 'moment';

const { MonthPicker } = DatePicker;

// 盲时类型
const BLIND_TYPES = {
  month: { key: 'month', label: '整月' },
  day: { key: 'day', label: '整日' },
  time_range: { key: 'time_range', label: '时间段' }
};

class BlindTimeTable extends Component {
  constructor(props) {
    super(props);
    this.state = {
      editingKey: null
    };
  }

  // 添加盲时规则
  handleAdd = () => {
    const { value = [], onChange } = this.props;
    const newItem = {
      key: Date.now(),
      blindType: 'month',
      blindValue: ''
    };
    onChange([...value, newItem]);
  };

  // 删除盲时规则
  handleDelete = (key) => {
    const { value = [], onChange } = this.props;
    onChange(value.filter(item => item.key !== key));
  };

  // 修改盲时类型
  handleTypeChange = (key, blindType) => {
    const { value = [], onChange } = this.props;
    const newData = value.map(item => {
      if (item.key === key) {
        return { ...item, blindType, blindValue: '' };
      }
      return item;
    });
    onChange(newData);
  };

  // 修改盲时值
  handleValueChange = (key, blindValue) => {
    const { value = [], onChange } = this.props;
    const newData = value.map(item => {
      if (item.key === key) {
        return { ...item, blindValue };
      }
      return item;
    });
    onChange(newData);
  };

  // 渲染盲时值输入组件
  renderValueInput = (record) => {
    const { blindType, blindValue, key } = record;

    switch (blindType) {
      case 'month':
        return (
          <MonthPicker
            value={blindValue ? moment(blindValue, 'MM') : null}
            format="MM月"
            placeholder="选择月份"
            onChange={(date) => {
              if (date) {
                this.handleValueChange(key, date.format('MM'));
              } else {
                this.handleValueChange(key, '');
              }
            }}
          />
        );

      case 'day':
        // 整日：每月指定日期整天都是忙时，值为1-31的数字
        return (
          <InputNumber
            min={1}
            max={31}
            value={blindValue ? parseInt(blindValue, 10) : null}
            placeholder="选择日期(1-31)"
            style={{ width: 150 }}
            onChange={(val) => {
              if (val) {
                this.handleValueChange(key, String(val));
              } else {
                this.handleValueChange(key, '');
              }
            }}
            addonAfter="号"
          />
        );

      case 'time_range':
        const [startTime, endTime] = blindValue ? blindValue.split('-') : ['', ''];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TimePicker
              value={startTime ? moment(startTime, 'HH:mm') : null}
              format="HH:mm"
              placeholder="开始时间"
              onChange={(time) => {
                if (time) {
                  const newStartTime = time.format('HH:mm');
                  // 校验开始时间必须小于结束时间（PRD §5.4）
                  if (endTime && newStartTime >= endTime) {
                    message.warning('开始时间必须小于结束时间，不支持跨天配置');
                    return;
                  }
                  const newValue = `${newStartTime}-${endTime || ''}`;
                  this.handleValueChange(key, newValue);
                }
              }}
            />
            <span>~</span>
            <TimePicker
              value={endTime ? moment(endTime, 'HH:mm') : null}
              format="HH:mm"
              placeholder="结束时间"
              onChange={(time) => {
                if (time) {
                  // 校验结束时间必须大于开始时间
                  if (startTime && time.format('HH:mm') <= startTime) {
                    message.warning('结束时间必须大于开始时间，不支持跨天配置');
                    return;
                  }
                  const newValue = `${startTime || ''}-${time.format('HH:mm')}`;
                  this.handleValueChange(key, newValue);
                }
              }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // 格式化显示盲时值
  formatBlindValue = (record) => {
    const { blindType, blindValue } = record;
    if (!blindValue) return '-';

    switch (blindType) {
      case 'month':
        return `${blindValue}月整月`;
      case 'day':
        return `每月${blindValue}号整日`;
      case 'time_range':
        return `每天 ${blindValue}`;
      default:
        return blindValue;
    }
  };

  render() {
    const { value = [] } = this.props;

    const columns = [
      {
        title: '序号',
        dataIndex: 'index',
        width: 60,
        render: (_, __, index) => index + 1
      },
      {
        title: '盲时类型',
        dataIndex: 'blindType',
        width: 150,
        render: (text, record) => (
          <Select
            value={text}
            style={{ width: 120 }}
            onChange={(val) => this.handleTypeChange(record.key, val)}
          >
            {Object.values(BLIND_TYPES).map(type => (
              <Select.Option key={type.key} value={type.key}>{type.label}</Select.Option>
            ))}
          </Select>
        )
      },
      {
        title: '盲时值',
        dataIndex: 'blindValue',
        render: (_, record) => this.renderValueInput(record)
      },
      {
        title: '操作',
        width: 80,
        render: (_, record) => (
          <Popconfirm
            title="确定删除此盲时规则？"
            onConfirm={() => this.handleDelete(record.key)}
            okText="确定"
            cancelText="取消"
          >
            <DeleteOutlined className="delete-btn" />
          </Popconfirm>
        )
      }
    ];

    return (
      <div className="blind-time-table">
        <Table
          columns={columns}
          dataSource={value}
          rowKey="key"
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无盲时配置' }}
        />
        <Button
          type="dashed"
          onClick={this.handleAdd}
          icon={<PlusOutlined />}
          className="add-btn"
        >
          添加盲时规则
        </Button>
        <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
          提示：盲时判断优先级为 整月 → 整日 → 时间段；盲时仅控制下发时机，不会中断已执行的任务
        </div>
      </div>
    );
  }
}

export default BlindTimeTable;

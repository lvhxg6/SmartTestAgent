import React, { Component } from 'react';
import { Tooltip, Empty } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';

class ToolCardSelect extends Component {
  handleSelect = (toolId) => {
    const { onChange } = this.props;
    if (onChange) {
      onChange(toolId);
    }
  };

  render() {
    const { tools = [], value } = this.props;

    if (tools.length === 0) {
      return <Empty description="暂无可用工具" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <div className="tool-card-select">
        {tools.map(tool => (
          <div
            key={tool.id}
            className={`tool-card ${value === tool.id ? 'selected' : ''}`}
            onClick={() => this.handleSelect(tool.id)}
          >
            <div className="tool-name">
              <Tooltip title={tool.name}>
                {tool.name}
              </Tooltip>
              {value === tool.id && (
                <CheckCircleFilled style={{ color: '#1890ff', marginLeft: 4 }} />
              )}
            </div>
            <div className="tool-version">版本：{tool.version || '-'}</div>
            {tool.description && (
              <div className="tool-desc">
                <Tooltip title={tool.description}>
                  {tool.description}
                </Tooltip>
              </div>
            )}
            {!tool.hasTemplates && (
              <div className="tool-desc" style={{ color: '#faad14' }}>
                使用内置默认模板
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
}

export default ToolCardSelect;

import React from 'react';

import { Card, Typography, Tag, Divider, List, Space } from '@arco-design/web-react';

import { PlanningEvent } from '@/demo/mcp/types/event';
export const PlanningEventView: React.FC<{ event: PlanningEvent }> = ({ event }) => (
  <List
    className={'my-2'}
    size="small"
    header="任务列表"
    dataSource={event.planning.items}
    render={(item, idx) => (
      <List.Item key={idx}>
        <Space>
          <Typography.Text bold>{item.description}</Typography.Text>
          <Tag>{item.assign_agent}</Tag>
          <Tag color={item.done ? 'green' : idx > 0 && event.planning.items[idx - 1].done ? 'arcoblue' : 'orange'}>
            {item.done ? '已完成' : idx > 0 && event.planning.items[idx - 1].done ? '进行中' : '等待中'}
          </Tag>
        </Space>
      </List.Item>
    )}
  />
);

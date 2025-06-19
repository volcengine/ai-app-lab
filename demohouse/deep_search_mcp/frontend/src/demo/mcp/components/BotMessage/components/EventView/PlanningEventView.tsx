// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

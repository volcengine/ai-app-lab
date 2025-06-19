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

import { ReactComponent as IconCalledMCP } from '@/images/deepResearch/icon_called_mcp.svg';
import { Event, EventType } from '@/demo/mcp/types/event';

import Collapse from '../../../Collapse';
import { AnimatedSubtitle } from '../AnimatedSubtitle';
import { ToolBtn } from '../EventView/ToolBtn';
import styles from './index.module.less';

interface Props {
  events: Event[];
  finish: boolean;
}

const MCPServerContent = (props: Props) => {
  const { events, finish } = props;

  const renderNotice = (event: Event) => {
    switch (event.type) {
      case 'web_search': {
        return (
          <div className={styles.notice}>
            <span>搜索</span>
            <span>{`「${event.result?.query}」`}</span>
          </div>
        );
      }
      case 'link_reader': {
        return (
          <div className={styles.notice}>
            <span>解析「URL」中</span>
          </div>
        );
      }
      case 'python_executor': {
        return (
          <div className={styles.notice}>
            <span>Python 运行中</span>
          </div>
        );
      }
      case 'knowledge_base_search': {
        return (
          <div className={styles.notice}>
            <span>检索「知识库」中</span>
          </div>
        );
      }
      case 'function': {
        return null;
      }
      default: {
        return null;
      }
    }
  };

  const renderContent = (event: Event) => {
    switch (event.type) {
      case EventType.Planning: {
        return null;
      }
      case EventType.WebSearch:
      case EventType.LinkReader:
      case EventType.PythonExecutor:
      case EventType.KnowledgeBaseSearch:
      case EventType.ChatPPT:
      case EventType.Function: {
        return (
          <div className="flex flex-col gap-[10px]">
            {/* {renderNotice(event)} */}
            <ToolBtn
              id={event.id}
              type={event.type}
              loading={event.result?.status !== 'completed' && !finish}
              functionName={event.result?.function_name}
              success={event.result?.success}
            />
          </div>
        );
      }
      case EventType.BrowserUse: {
        const { history = [] } = event;
        const browserMessages: string[] = [];
        history.forEach(item => {
          if (item.metadata && item.metadata.type === 'message' && item.metadata.data.message) {
            browserMessages.push(item.metadata.data.message);
          }
        });

        return (
          <div className="flex flex-col gap-[10px]">
            <ToolBtn
              id={event.id}
              type={event.type}
              loading={event.status === 'pending' && !finish}
              success={event.result?.success}
            />
            {browserMessages.length > 0 && (
              <Collapse headerClassName="!w-fit" title={<div className={styles.browserTitle}>浏览器操作步骤</div>}>
                <div className="flex flex-col gap-[12px] text-[#42464E] font-[400]">
                  {browserMessages.map((content, index) => (
                    <div key={index}>{content}</div>
                  ))}
                </div>
              </Collapse>
            )}
          </div>
        );
      }
      default: {
        return null;
      }
    }
  };

  return (
    <Collapse
      title={
        <AnimatedSubtitle
          icon={<IconCalledMCP style={{ color: '#42464E' }} />}
          isLoading={!finish}
          text={'Called MCP Servers'}
        />
      }
      defaultOpen={true}
      autoFold={finish}
    >
      <div className="pl-[20px] flex flex-col gap-[10px]">
        {events.map((event, index) => (
          <div key={index}>{renderContent(event)}</div>
        ))}
      </div>
    </Collapse>
  );
};

export default MCPServerContent;

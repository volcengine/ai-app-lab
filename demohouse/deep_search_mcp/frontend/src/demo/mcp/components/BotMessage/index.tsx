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

import React, { ReactNode } from 'react';

import { Message } from '../../types/message';
import ErrorMessage from './components/ErrorMessage';
import MCPMessage from './components/MCPMessage';
import { BotMessageContext } from '../../store/BotMessageContext/context';
import PreMCPMessage from './components/PreMCPMessage';
import PauseMessage from './components/PauseMessage';
import LoadingMessage from './components/LoadingMessage';

interface Props {
  message: Message;
  footer: ReactNode;
  confirmFooter: ReactNode;
}

const BotMessage = (props: Props) => {
  const { message, footer, confirmFooter } = props;

  const render = () => {
    if (!message.content && (!message.events || message.events.length === 0) && !message.finish) {
      // 什么都没有并且状态在进行中，说明第一个 chunk 尚未返回，展示 loading
      return <LoadingMessage />;
    }
    switch (message.type) {
      case 'manual-pause': {
        return <PauseMessage message={message} footer={footer} />;
      }
      case 'error': {
        return <ErrorMessage message={message} footer={footer} />;
      }
      case 'mcp': {
        return <MCPMessage message={message} footer={footer} />;
      }
      case 'pre-mcp': {
        return <PreMCPMessage message={message} footer={confirmFooter} />;
      }
      default: {
        return null;
      }
    }
  };

  if (!message) {
    return null;
  }

  return (
    <BotMessageContext.Provider
      value={{ sessionId: message.sessionId ?? '', sessionQuery: message.sessionQuery ?? '', finish: message.finish }}
    >
      <div className="pb-[28px] w-full">{render()}</div>
    </BotMessageContext.Provider>
  );
};

export default BotMessage;

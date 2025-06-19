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

import { type PropsWithChildren, useCallback, useState } from 'react';

import { requestBff } from '@/utils/request';

import { useIndexedDB } from '../../hooks/useIndexedDB';
import type { Host } from '../../types';
import type { Message } from '../../types/message';
import { useCanvasStore } from '../CanvasStore';
import { ChatStoreContext } from './context';
interface Props {
  host: Host;
  debugEnabled?: boolean;
  botId: string;
  url: string;
  urlPrefix?: string;
  config?: any;
  accountId: string;
  userId: string;
  getHeader?: () => Record<string, Record<string, string>>;
  maxTokenLimit?: number;
}

const ChatStoreProvider = (props: PropsWithChildren<Props>) => {
  const {
    children,
    host,
    debugEnabled,
    botId,
    url,
    urlPrefix,
    config,
    accountId,
    userId,
    getHeader,
    maxTokenLimit = 4096,
  } = props;
  const [chatList, setChatList] = useState<Message[]>([]);
  const [amountConfig, setAmountConfig] = useState<{
    usage: number;
    quota: number;
  }>({ usage: 0, quota: 0 });
  const [isChatting, setIsChatting] = useState(false);

  const GetAssistantChatRate = requestBff('GetAssistantChatRate');

  const dbInstance = useIndexedDB(`${accountId}_${userId}_${botId}`);
  const updateDataFromMessage = useCanvasStore(
    state => state.updateDataFromMessage,
  );

  const getAmountConfig = useCallback(async () => {
    const res: any = await GetAssistantChatRate(
      { BotId: botId, Scene: 'DeepResearch' },
      {
        axiosConfig: {
          headers: getHeader?.()?.bff,
        },
      },
    );
    setAmountConfig({
      usage: res?.Usage || 0,
      quota: res?.Quota || 0,
    });
  }, [botId]);

  const addChatMessage = useCallback((newMessage: Message) => {
    // 增加
    setChatList(prev => [...prev, newMessage]);
  }, []);

  const clearChatList = () => {
    setChatList([]);
    if (dbInstance) {
      dbInstance.putItem({ messages: [], screencastFrame: {} });
    }
  };

  const getLastBotMessage = useCallback(
    () => chatList.findLast(m => m.role === 'assistant'),
    [chatList],
  );

  const getLastUserMessage = useCallback(
    () => chatList.findLast(m => m.role === 'user'),
    [chatList],
  );

  const updateChatMessage = (
    id: string,
    updateMessage: (message: Message) => Message,
  ) => {
    // 更新
    // 将 message 更新到最新的版本中
    setChatList(prev => {
      const newList = prev.map(item => {
        if (item.id !== id) {
          return item;
        }
        const newMessage = updateMessage(item);
        return {
          ...newMessage,
        };
      });

      // 将最新的 list 存储到 indexedDB 中
      if (dbInstance) {
        // 查找符合 id 的 message 中的 events 中最新的事件是否是 planning 类型
        const message = newList.find(item => item.id === id);
        if (message && message.events && message.events.length > 0) {
          const event = message.events[message.events.length - 1];
          // planning 事件都存一下
          // 除了 load，否则在开始任务时，load 存到db里，后续任务出错会只回填出来一个load数据，导致页面出现消息白块
          if (event.type === 'planning' && event.result?.action !== 'load') {
            // 存储到 indexedDB 中
            dbInstance.putItem({ messages: newList });
          }
        }

        if (message?.finish) {
          // 存储到 indexedDB 中
          dbInstance.putItem({ messages: newList });
        }
      }
      return newList;
    });
  };

  const updateIsChatting = (val: boolean) => {
    setIsChatting(val);
  };

  const getHistoryMessage = useCallback(async () => {
    if (dbInstance) {
      const res = await dbInstance.getItem();
      if (res?.messages) {
        res.messages.forEach((message: Message) => {
          if (message.role === 'assistant' && message.events) {
            updateDataFromMessage(message);
          }
        });

        setChatList(res.messages);
        return res.messages;
      } else {
        setChatList([]);
        return [];
      }
    }
    return;
  }, [dbInstance]);

  const [chatConfig, setChatConfig] = useState({
    frequency_penalty: 0,
    temperature: 1,
    top_p: 0.7,
    max_tokens: 4096,
    max_tokens_limit: maxTokenLimit,
  });
  const updateChatConfig = (config: Partial<typeof chatConfig>) => {
    setChatConfig(prev => ({
      ...prev,
      ...config,
    }));
  };

  // 恢复到完整的 step
  const recoverToCompleteStep = async (id: string) => {
    // 先查找 indexed db 是否有当前 id 的 message，有说明任务在进行中
    if (dbInstance) {
      const res = await dbInstance.getItem();
      if (res?.messages) {
        const message = res.messages.find(
          (item: { id: string }) => item.id === id,
        );
        if (message) {
          res.messages.forEach((message: Message) => {
            if (message.role === 'assistant' && message.events) {
              updateDataFromMessage(message);
            }
          });

          setChatList(res.messages);
          return true;
        }
      }
    }
    return false;
  };

  return (
    <ChatStoreContext.Provider
      value={{
        host,
        debugEnabled,
        botId,
        url,
        config,
        chatList,
        amountConfig,
        isChatting,
        getAmountConfig,
        addChatMessage,
        updateChatMessage,
        clearChatList,
        getLastUserMessage,
        getLastBotMessage,
        updateIsChatting,
        getHeader,
        getHistoryMessage,
        accountId,
        userId,
        chatConfig,
        updateChatConfig,
        recoverToCompleteStep,
      }}
    >
      {children}
    </ChatStoreContext.Provider>
  );
};

export default ChatStoreProvider;

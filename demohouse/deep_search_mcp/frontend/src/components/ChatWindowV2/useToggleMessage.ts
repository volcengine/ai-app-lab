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

import { useContext, useMemo } from 'react';

import { ChatWindowContext, UserMessage, BotMessage } from './context';

export enum EToggleMessageDirection {
  Prev = 'Prev',
  Next = 'Next',
}

export const useToggleMessage = () => {
  const { messages, setMessages, removeLoadingCardInVersions } = useContext(ChatWindowContext);

  const lastAssistantMsgIndex = useMemo(
    () => messages.findLastIndex((msg: UserMessage | BotMessage) => msg.role === 'assistant'),
    [messages],
  );
  const lastAssistantMsg = messages[lastAssistantMsgIndex] as BotMessage;

  const toggle = (messageId: number, direction: EToggleMessageDirection) => {
    const newSelectedVersion =
      direction === EToggleMessageDirection.Prev
        ? lastAssistantMsg.currentVersion - 1
        : lastAssistantMsg.currentVersion + 1;
    // 移除目标version的loading卡片
    removeLoadingCardInVersions(newSelectedVersion);
    // 更新
    setTimeout(() => {
      setMessages(prev =>
        prev.map((v, idx) => {
          if (idx === lastAssistantMsgIndex) {
            return {
              ...v,
              currentVersion: newSelectedVersion,
            };
          } else {
            return v;
          }
        }),
      );
    }, 0);
  };

  // 只有 lastMsg 可以切换回答
  const enableLastMsgDirection = useMemo(
    () => ({
      canPrev: lastAssistantMsg.currentVersion > 0,
      canNext: lastAssistantMsg.currentVersion < lastAssistantMsg.versions?.length - 1,
    }),
    [lastAssistantMsg],
  );

  const indicator = useMemo(
    () => ({
      show: lastAssistantMsg?.versions?.length > 1,
      current: lastAssistantMsg.currentVersion + 1,
      total: lastAssistantMsg?.versions?.length,
    }),
    [lastAssistantMsg],
  );

  return {
    indicator,
    toggle,
    enableLastMsgDirection,
  };
};

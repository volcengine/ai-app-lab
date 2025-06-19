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

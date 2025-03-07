import { useCallback, useRef } from 'react';

import { v4 as uuidv4 } from 'uuid';

import { useChatStore } from '@/demo/longTermMemory/stores/useChatStore';
import { startChat } from '@/demo/longTermMemory/api';

export const useChat = () => {
  const { chatList, isReasoning, addMsg, removeMsg, getCurrentRoundChatList, updateMsg, setIsReasoning } =
    useChatStore();
  const accRef = useRef('');
  const handleChatResponse = useCallback(
    (msgId: string, data: string) => {
      try {
        const apiResponse: any = JSON.parse(data);
        const { id, choices = [], metadata = {} as any } = apiResponse;
        const { returned_memories = [] } = metadata;
        const content = choices?.[0]?.delta?.content ?? '';
        accRef.current = accRef.current + content;

        updateMsg(msgId, {
          content: accRef.current,
          logId: id,
          ...(returned_memories.length ? { memories: returned_memories } : {}),
          finish: choices?.[0]?.finish_reason !== undefined,
        });
      } catch (error) {
        console.error('Error parsing API response:', error);
        updateMsg(msgId, { finish: true });
      }
    },
    [updateMsg],
  );

  const handleChatEnd = useCallback(
    (msgId: string) => {
      setIsReasoning(false);
      updateMsg(msgId, { finish: true });
      accRef.current = '';
    },
    [setIsReasoning, updateMsg],
  );

  const sendUserMsg = useCallback(
    (content: string) => {
      setIsReasoning(true);
      const userMsgId = uuidv4();
      addMsg({
        id: userMsgId,
        content,
        role: 'user',
        finish: true,
      });

      const botMsgId = uuidv4();
      const msg = getCurrentRoundChatList();
      addMsg({
        id: botMsgId,
        content: '',
        role: 'assistant',
        finish: false,
      });
      startChat(
        msg,
        data => handleChatResponse(botMsgId, data),
        () => handleChatEnd(botMsgId),
      );
    },
    [addMsg, getCurrentRoundChatList, handleChatResponse, handleChatEnd],
  );

  const retry = useCallback(
    (botMsgId: string) => {
      setIsReasoning(true);
      const botMsgIdx = chatList.findIndex(item => item.id === botMsgId);
      if (botMsgIdx !== -1) {
        removeMsg(botMsgId);
        const msg = getCurrentRoundChatList();
        addMsg({
          id: botMsgId,
          content: '',
          role: 'assistant',
          finish: false,
        });
        startChat(
          msg,
          data => handleChatResponse(botMsgId, data),
          () => handleChatEnd(botMsgId),
        );
      }
    },
    [addMsg, chatList, getCurrentRoundChatList, handleChatEnd, handleChatResponse, removeMsg, setIsReasoning],
  );

  return {
    retry,
    sendUserMsg,
    chatList,
    canSend: !isReasoning,
  };
};

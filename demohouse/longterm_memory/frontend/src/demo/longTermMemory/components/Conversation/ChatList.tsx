import React from 'react';

import { ChatMessage } from '@/demo/longTermMemory/components/ChatMessage';
import { useChatStore } from '@/demo/longTermMemory/stores/useChatStore';

import s from './index.module.less';
export const ChatList = () => {
  const { chatList } = useChatStore();

  return (
    <div className={s.msgList}>
      {chatList.map((message, idx) => (
        <ChatMessage key={message.id} message={message} isLast={idx === chatList.length - 1} />
      ))}
    </div>
  );
};

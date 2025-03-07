import React, { useEffect, useRef } from 'react';

import cx from 'classnames';

import { Welcome } from '@/demo/longTermMemory/components/Conversation/Welcome';
import { ChatList } from '@/demo/longTermMemory/components/Conversation/ChatList';
import { useChat } from '@/demo/longTermMemory/hooks/useChat';
import { MessageInput } from '@/demo/longTermMemory/components/MessageInput';
import { useScrollToBottom } from '@/demo/longTermMemory/hooks/useScrollToBottom';
import Disclaimer from '@/demo/longTermMemory/components/Disclaimer';

import s from './index.module.less';

export const Conversation = () => {
  const eventSourceRef = useRef<EventSource | null>(null);
  const { chatList, canSend, sendUserMsg } = useChat();

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
    },
    [],
  );

  const handleSend = (message: string) => {
    if (!message) {
      return;
    }
    sendUserMsg(message);
  };

  const { scrollRef, scrollDomToBottom } = useScrollToBottom(true);
  useEffect(() => {
    scrollDomToBottom();
  }, [chatList.length, scrollDomToBottom]);

  return (
    <div className={s.chat}>
      <div
        ref={scrollRef}
        className={cx(
          'scroll-smooth w-full flex px-8 pb-8 overflow-auto',
          chatList.length ? 'items-start pt-[50px] flex-col-reverse' : 'items-center flex-1',
          s.noScrollBar,
        )}
      >
        {chatList.length === 0 ? <Welcome /> : <ChatList />}
      </div>
      <div className={'w-full px-8'}>
        <MessageInput
          activeSendBtn={true}
          autoFocus
          placeholder={'快找我聊天,我可以根据历史记忆生成个性化回答'}
          canSendMessage={canSend}
          sendMessage={handleSend}
          extra={() => <></>}
          expandDisabled={!canSend}
        />
        <div className={'py-[10px]'}>
          <Disclaimer />
        </div>
      </div>
    </div>
  );
};

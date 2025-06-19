import React, { forwardRef, useImperativeHandle, useMemo } from 'react';

import cx from 'classnames';

import UserMessage from '../UserMessage';
import { Message } from '../../types/message';
import s from './index.module.less';
import BotMessageGroup from '../BotMessageGroup';
import { useScrollToBottom } from '../../hooks/useScrollToBottom';

interface ChatListProps {
  data: Message[];
  className?: string;
  retryMessage: () => void;
  startTask: () => void;
}

export interface ChatListRef {
  scrollDomToBottom: () => void;
}

export const ChatList = forwardRef<ChatListRef, ChatListProps>((props, ref) => {
  const { data, className, retryMessage, startTask } = props;

  const { scrollRef, scrollDomToBottom } = useScrollToBottom();

  useImperativeHandle(ref, () => ({
    scrollDomToBottom,
  }));

  const splitMessages = useMemo(() => {
    const parsedData: (Message | Message[])[] = [];
    data.forEach(item => {
      if (item.role === 'user') {
        parsedData.push(item);
        return;
      }

      if (item.role === 'assistant') {
        const lastParsedData = parsedData[parsedData.length - 1];
        if (Array.isArray(lastParsedData)) {
          lastParsedData.push(item);
        } else {
          parsedData.push([item]);
        }
        return;
      }
    });
    return parsedData;
  }, [data]);

  return (
    <div className={cx(s.reverseScroll, className)} ref={scrollRef}>
      <div className={s.chatList}>
        {splitMessages.map((item, index) => {
          if (Array.isArray(item)) {
            // bot 消息为数组
            return (
              <BotMessageGroup
                key={index}
                data={item}
                isLast={splitMessages.length - 1 === index}
                retryMessage={retryMessage}
                startTask={startTask}
              />
            );
          }
          // user 消息为对象
          const { content } = item;
          return <UserMessage key={index} id={item.id} content={content} />;
        })}
      </div>
      <div className="h-[60px]"></div>
    </div>
  );
});

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

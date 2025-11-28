/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { memo, ReactNode, useState } from "react";
import classNames from "classnames";
import { Button } from "@arco-design/web-react";
import { IconEdit } from "@arco-design/web-react/icon";

export interface Message {
  type: "user" | "assistant";
  status?: "loading" | "success" | "error";
  id: string;
  data: any;
  parentId?: string;
  timestamp: number;
}

export interface MessageItemProps {
  message: Message;
  children: React.ReactNode | ((item: Message) => React.ReactNode);
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  children,
}) => {
  const content = typeof children === "function" ? children(message) : children;
  return <>{content}</>;
};

export const MemoizedMessageItem = memo(MessageItem) as typeof MessageItem;

export interface MessageListProps {
  className?: string;
  messages: Message[];
  children: (item: Message) => React.ReactNode;
  emptyBox?: React.ReactNode;
}

export const MessageList: React.FC<MessageListProps> = ({
  className,
  messages,
  children,
  emptyBox,
}) => {
  return (
    <div className={classNames(className, "flex flex-col p-4 h-full")}>
      {messages?.length > 0 ? (
        messages.map((message, index) => (
          <MemoizedMessageItem key={index} message={message}>
            {children}
          </MemoizedMessageItem>
        ))
      ) : (
        <div className="flex items-center justify-center h-full">
          {!emptyBox ? (
            <div className="text-3xl font-bold">体验图片生成，让创意摇动</div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export interface MessageCardProps {
  className?: string;
  areaLeftTop?: ReactNode;
  areaRightSide?: ReactNode;
  children: React.ReactNode;
  onEditClick?: () => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({
  className,
  areaLeftTop,
  areaRightSide,
  children,
  onEditClick,
}) => {
  const [isShowRightSide, setIsShowRightSide] = useState(false);

  return (
    <div
      className={classNames(
        className,
        "relative mb-9 max-w-[600px] overflow-hidden"
      )}
      onMouseEnter={() => {
        setIsShowRightSide(true);
      }}
      onMouseLeave={() => {
        setIsShowRightSide(false);
      }}
    >
      <div className="absolute top-5 left-5 z-10">{areaLeftTop}</div>
      {isShowRightSide && (
        <div className="absolute top-5 right-5">{areaRightSide}</div>
      )}
      <div className="mb-2 over">{children}</div>
      <Button icon={<IconEdit />} onClick={onEditClick}>
        重新编辑
      </Button>
    </div>
  );
};

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

import { memo } from 'react';

import Avatar from './components/Avatar';
import ErrorContent from './components/ErrorContent';
import MessageContent from './components/MessageContent';
import styles from './style/index.module.less';
import type { MessageItemProps } from './types';

/**
 * 消息项
 * @param message 消息内容
 * @param avatar 头像
 * @param errorMessage 错误消息
 * @param isAnimate 是否动画
 * @param className 类名
 * @param style 样式
 * @param renderMessage 渲染消息
 * @param renderAnimateMessage 渲染动画消息
 * @param renderErrorMessage 渲染错误消息
 * @constructor
 */
const MessageItem = ({
  message,
  avatar,
  errorMessage,
  isAnimate,
  className,
  style,
  renderMessage,
  renderAnimateMessage,
  renderErrorMessage,
  messageClassName,
}: MessageItemProps) => (
  <div className={`${styles.arkUiChatMessageItem} ${className}`} style={style}>
    <Avatar avatar={avatar} />
    {errorMessage ? (
      <ErrorContent
        errorMessage={errorMessage}
        renderErrorMessage={renderErrorMessage}
      />
    ) : (
      <MessageContent
        className={messageClassName}
        message={message}
        isAnimate={isAnimate}
        renderMessage={renderMessage}
        renderAnimateMessage={renderAnimateMessage}
      />
    )}
  </div>
);

export default memo(MessageItem);

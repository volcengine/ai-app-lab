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

import { FC, useEffect, useState } from 'react';

import { MessageItemProps } from '../../types';
import EditableMessage from '../EditableMessage';
import AnimateMessage from '../AnimateMessage';
import styles from './index.module.less';

export interface MessageContentProps {
  message: MessageItemProps['message'];
  isAnimate?: MessageItemProps['isAnimate'];
  editable?: MessageItemProps['editable'];
  renderMessage?: MessageItemProps['renderMessage'];
  renderAnimateMessage?: MessageItemProps['renderAnimateMessage'];
  messageExtra?: MessageItemProps['messageExtra'];
}

const MessageContent: FC<MessageContentProps> = ({
  message,
  isAnimate,
  editable,
  renderMessage,
  renderAnimateMessage,
  messageExtra,
}) => {
  const [showAnimation, setShowAnimation] = useState(isAnimate);

  useEffect(() => {
    let timer: number;

    if (isAnimate) {
      setShowAnimation(true);
    } else if (!isAnimate && showAnimation) {
      // 假设动画持续时间为 500 毫秒
      timer = window.setTimeout(() => {
        setShowAnimation(false);
      }, 500);
    }

    return () => clearTimeout(timer);
  }, [isAnimate, showAnimation]);

  const animateMessage = renderAnimateMessage ? renderAnimateMessage(message) : <AnimateMessage message={message} />;

  if (showAnimation) {
    return <div className={styles.ani}>{animateMessage}</div>;
  }

  return (
    <>
      {renderMessage ? renderMessage(message) : <EditableMessage message={message} />}
      {messageExtra && !editable ? <div>{messageExtra}</div> : null}
    </>
  );
};

export default MessageContent;

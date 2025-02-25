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

import { useContext } from 'react';


import clsx from 'classnames';
import { IconRefresh } from '@arco-design/web-react/icon';

import { ChatWindowContext, Message } from '@/components/ChatWindowV2/context';
import { CopyButton } from '@/components/CopyButton';

import styles from './style.module.less';
import { ActionIcon } from '../ActionIcon';
import { MessageBranchChecker } from '../MessageBranchChecker';

interface Props {
  assistantMessage: Message;
  // eslint-disable-next-line react/boolean-prop-naming
  retryable: boolean;
  className?: string;
  isLastMessage?: boolean;
}

export const AnswerOperation = ({ assistantMessage, retryable, isLastMessage, className }: Props) => {
  const { retryMessage } = useContext(ChatWindowContext);

  const handleRebuild = () => {
    retryMessage();
  };

  return (
    <div className={clsx(styles.operation, className)}>
      {/* 重新生成 & 分支切换 */}
      {isLastMessage ? <MessageBranchChecker message={assistantMessage} /> : null}
      {retryable ? (
        <ActionIcon tips={'重新生成'} onClick={handleRebuild}>
          <IconRefresh />
        </ActionIcon>
      ) : null}
      {/* 复制 */}
      <CopyButton textToCopy={assistantMessage.content} />
    </div>
  );
};

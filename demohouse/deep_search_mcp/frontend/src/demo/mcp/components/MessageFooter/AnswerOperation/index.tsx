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

import { IconRefresh } from '@arco-design/web-react/icon';
import clsx from 'classnames';

import { ActionIcon } from '@/components/ActionIcon';
import { CopyButton } from '@/components/CopyButton';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import { Host } from '@/demo/mcp/types';
import type { Message } from '@/demo/mcp/types/message';

import { MessageBranchChecker } from '../MessageBranchChecker';
import styles from './style.module.less';

interface Props {
  content: string;
  retryable: boolean;
  className?: string;
  isLast?: boolean;
  type: Message['type'];
  eventType: string;
  current: number;
  total: number;
  updateCurrent: (val: number) => void;
  retryMessage?: () => void;
}

export const AnswerOperation = ({
  current,
  total,
  content,
  retryable,
  isLast,
  type,
  eventType,
  className,
  updateCurrent,
  retryMessage,
}: Props) => {
  const handleRebuild = () => {
    retryMessage?.();
  };
  const { host } = useChatInstance();
  return (
    <div className="flex items-center gap-2">
      <div className={clsx(styles.operation, className)}>
        {/* 重新生成 & 分支切换 */}
        {isLast ? (
          <MessageBranchChecker
            current={current}
            total={total}
            updateCurrent={updateCurrent}
          />
        ) : null}
        {isLast ? (
          <ActionIcon
            disabled={!retryable}
            tips={'重试'}
            onClick={handleRebuild}
          >
            <IconRefresh />
          </ActionIcon>
        ) : null}
        {/* 复制 */}
        <CopyButton textToCopy={content} />
      </div>
    </div>
  );
};

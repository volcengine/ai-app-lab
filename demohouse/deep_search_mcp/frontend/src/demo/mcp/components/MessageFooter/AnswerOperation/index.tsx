import { IconRefresh } from '@arco-design/web-react/icon';
import clsx from 'classnames';

import { ActionIcon } from '@/components/ActionIcon';
import { CopyButton } from '@/components/CopyButton';
import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import { Host } from '@/demo/mcp/types';
import type { Message } from '@/demo/mcp/types/message';

import { Feedback } from '../Feedback';
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
      {type !== 'error' &&
        type !== 'manual-pause' &&
        eventType !== 'error' &&
        eventType !== 'manual-pause' &&
        host === Host.AIBOTSQUARE && <Feedback />}
    </div>
  );
};

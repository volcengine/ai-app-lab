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

import React, { useMemo } from 'react';

import { Button, Popover } from '@arco-design/web-react';
import { IconInfoCircle } from '@arco-design/web-react/icon';
import cx from 'classnames';

import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import type { Message } from '@/demo/mcp/types/message';
import { IconBotDebug } from '@/images';

import { useConfigStore } from '../../store/ConfigStore/useConfigStore';
import { AnswerOperation } from './AnswerOperation';
import styles from './index.module.less';

interface Props {
  message: Message;
  isLast: boolean;
  current: number;
  total: number;
  updateCurrent: (val: number) => void;
  retryMessage?: () => void;
}

const MessageFooter = (props: Props) => {
  const { message, isLast, current, total, updateCurrent, retryMessage } =
    props;
  const { requestId, logId, finish, type, events } = message;
  const { mcpDebugHelper } = useConfigStore();
  const mainContent = useMemo(() => {
    const { events, type, content } = message;
    if (type === 'error' || type === 'manual-pause') {
      return content;
    }
    if (events?.length) {
      // 取最后一个并且类型为output_text的事件
      // 还有 error 事件
      const errorEvent = events.findLast(item => item.type === 'error');
      if (errorEvent) {
        return errorEvent.result;
      }
      const outputTextEvent = events.findLast(
        item => item.type === 'output_text',
      );
      if (outputTextEvent) {
        return outputTextEvent.result;
      }
    }
    return content;
  }, [message]);

  const eventType = useMemo(() => {
    if (events?.length) {
      // 取最新的 event
      const latestEvent = events[events.length - 1];
      return latestEvent.type;
    }
    return '';
  }, [events]);

  const { debugEnabled = false } = useChatInstance();

  if (!finish) {
    return null;
  }

  return (
    <div className={styles.footWrapper}>
      <div className={styles.operation}>
        <AnswerOperation
          className="mt-0"
          isLast={isLast}
          type={type}
          eventType={eventType}
          content={mainContent}
          retryable={true}
          current={current}
          total={total}
          updateCurrent={updateCurrent}
          retryMessage={retryMessage}
        />
      </div>
      <div className="flex gap-2">
        {debugEnabled && (
          <Popover
            disabled={mcpDebugHelper?.isEnableTrace}
            content={
              '调试功能依赖于日志服务trace的开启，如需使用调试功能请开启日志服务。'
            }
          >
            <Button
              loading={mcpDebugHelper?.iframeloading}
              onClick={() => {
                if (!mcpDebugHelper?.isEnableTrace) {
                  return;
                }
                mcpDebugHelper?.toggleDebugPanel(message.id, requestId || '');
              }}
              icon={<IconBotDebug className={'w-4'} />}
              className={cx(
                'flex items-center',
                styles.common,
                styles.btn,
                // isError && '!bottom-[76px] !right-[36px]',
                !mcpDebugHelper?.isEnableTrace && 'cursor-not-allowed',
              )}
            >
              调试
            </Button>
          </Popover>
        )}
        <div className={styles.info}>
          <div className={styles.requestId}>
            <div>Request ID</div>
            <div className={styles.iconPart}>
              <Popover content={logId}>
                <IconInfoCircle />
              </Popover>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageFooter;

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

import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { Button, Message, Modal, Popover } from '@arco-design/web-react';
import { IconInfoCircleFill } from '@arco-design/web-react/icon';
import cx from 'classnames';

import { DebugParamsBtn } from '@/demo/mcp/components/Conversation/components/DebugParamsBtn';
import useFirstTimeTooltip from '@/demo/mcp/hooks/useFirstTimeTooltip';
import { useConfigStore } from '@/demo/mcp/store/ConfigStore/useConfigStore';
import { IconBotDebug } from '@/images';

import { IconClean } from '@/icon';
import { useChatRequest } from '../../hooks/useChatRequest';
import { useChatInstance } from '../../hooks/useInstance';
import { useCanvasStore } from '../../store/CanvasStore';
import { useChatConfigStore } from '../../store/ChatConfigStore/useChatConfigStore';
import { useSettingDrawerStore } from '../../store/ChatConfigStore/useSettingDrawerStore';
import { Host } from '../../types';
import Disclaimer from '..//Disclaimer';
import ActivateCanvasButton from '../ActivateCanvasButton';
import { PlanningChartButton } from '../PlanningChartButton';
import { ChatList, type ChatListRef } from './ChatList';
import { Welcome } from './Welcome';
import { MessageInput } from './components/MessageInput';
import { RoundSettingBtn } from './components/RoundSettingBtn';
import styles from './index.module.less';

export const Conversation = () => {
  const {
    host,
    chatList,
    isChatting,
    clearChatList,
    getHistoryMessage,
    debugEnabled = false,
  } = useChatInstance();

  const {
    sendUserMsg,
    abortMessage,
    continueMessage,
    pauseMessage,
    retryMessage,
    startTask,
  } = useChatRequest();
  const { mcpDebugHelper } = useConfigStore();
  const resetCanvasData = useCanvasStore(state => state.resetData);
  const { setDrawerVisible: setMcpConfigVisible } = useSettingDrawerStore();
  const setShowCanvas = useCanvasStore(state => state.setShowCanvas);

  const chatListRef = useRef<ChatListRef>(null);

  const currentBotMessageId = useMemo(() => {
    if (chatList.length > 0) {
      // 返回最后一条 role 为 assistant 的 id
      const assistantIndex = chatList.findLastIndex(
        item => item.role === 'assistant',
      );
      if (assistantIndex !== -1) {
        return chatList[assistantIndex].id;
      }
    }
    // 未找到
    return '';
  }, [chatList]);

  const resetMessage = () => {
    clearChatList();
    abortMessage();
    resetCanvasData();
    setShowCanvas(false);
    setMcpConfigVisible(true);
  };

  const pauseCurrentMessage = useCallback(() => {
    pauseMessage(currentBotMessageId);
  }, [currentBotMessageId, pauseMessage]);

  useEffect(() => {
    (async () => {
      const messages = await getHistoryMessage();
      if (messages) {
        continueMessage(messages);
      }
    })();
    return () => {
      abortMessage();
    };
  }, []);

  const handleSend = (message: string) => {
    if (!message) {
      return;
    }
    sendUserMsg(message);
    if (chatListRef.current) {
      chatListRef.current.scrollDomToBottom();
    }
  };

  return (
    <div className={styles.conversation}>
      {/* <div className={styles.quotaWrapper}>
        <QuotaShow quota={amountConfig.quota} usage={amountConfig.usage} needSimple={isChatting} />
      </div> */}
      {chatList.length === 0 && (
        <div className="h-full flex justify-center items-center px-[40px]">
          <Welcome handleSend={handleSend} />
        </div>
      )}
      {chatList.length > 0 && (
        <div className="flex-1 min-w-[0] max-w-[780px] h-full flex flex-col px-[40px]">
          <div className={styles.conversationChatAreaContainer}>
            <ChatList
              data={chatList as any}
              retryMessage={retryMessage}
              startTask={startTask}
              ref={chatListRef}
            />
          </div>
          <div className={'w-full bottom-8'}>
            {chatList.length > 0 && (
              <div className="w-full flex justify-between mb-[8px]">
                <PlanningChartButton />
                <Button
                  shape="round"
                  className="self-start !w-[83px] !p-0 !bg-[#fff]"
                  onClick={() => {
                    Message.success('对话已清空');
                    resetMessage();
                  }}
                >
                  <div className='flex justify-center items-center'>
                    <IconClean className={'mr-[4px] text-[#737A87]'} />
                    <span className={'text-[12px]'}>{'清空内容'}</span>
                  </div>
                </Button>
              </div>
            )}

            <MessageInput
              isExpandAlways
              activeSendBtn={true}
              autoFocus
              placeholder={'你想研究点什么？'}
              canSendMessage={!isChatting}
              sendMessage={handleSend}
              // actions={[<PdfUploadAction key={'doc'} />]}
              extra={() => (
                <>
                  <RoundSettingBtn />
                </>
              )}
              expandDisabled={false}
              isChatting={isChatting}
              pasueMessage={pauseCurrentMessage}
            />
            <div className={'pt-[12px] pb-[16px]'}>
              <Disclaimer />
            </div>
          </div>
        </div>
      )}
      {chatList.length > 0 && (
        <div className={styles.activateBtnWrapper}>
          {debugEnabled && (
            <>
              <DebugParamsBtn />
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
                    const lastMsg = chatList.findLast(
                      item => item.role === 'assistant',
                    );
                    if (lastMsg) {
                      mcpDebugHelper?.toggleDebugPanel(
                        lastMsg.id,
                        lastMsg.requestId,
                      );
                    } else {
                      console.error('debug panel error: lastMsg is undefined');
                    }
                  }}
                  icon={<IconBotDebug className={'w-4'} />}
                  className={cx(
                    'flex items-center !bg-white !box-shadow-none',
                    styles.common,
                    styles.btn,
                    // isError && '!bottom-[76px] !right-[36px]',
                    !mcpDebugHelper?.isEnableTrace && 'cursor-not-allowed',
                  )}
                >
                  调试
                </Button>
              </Popover>
            </>
          )}
          <ActivateCanvasButton />
        </div>
      )}
    </div>
  );
};

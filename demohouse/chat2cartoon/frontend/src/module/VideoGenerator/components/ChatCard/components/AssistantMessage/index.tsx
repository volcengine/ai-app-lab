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

import { useContext, useEffect, useState } from 'react';

import { Alert } from '@arco-design/web-react';
import clsx from 'classnames';
import { IconRefresh } from '@arco-design/web-react/icon';

import DoubaoImg from '@/images/assets/doubao.png';
import { ReactComponent as IconAiEdit } from '@/images/icon_ai_edit.svg';
import { ReactComponent as IconAiBulb } from '@/images/icon_ai_bulb.svg';
import MessageContent from '@/components/Chat/components/MessageItem/components/MessageContent';
import { ChatWindowContext, Message } from '@/components/ChatWindowV2/context';
import { Assistant } from '@/types/assistant';
import { responseForTextRiskReplace } from '@/constant';

import { BotMessageContext } from '../../../../store/BotMessage/context';
import styles from './index.module.less';
import ColorfulButton from '../../../ColorfulButton';
import { RenderedMessagesContext } from '../../../../store/RenderedMessages/context';
import { VideoGeneratorTaskPhase } from '../../../../types';
import { MessageBranchChecker } from '../../../Conversation/components/MessageBranchChecker';

interface AssistantMessageProps extends Message {
  phase?: string;
}

const AssistantMessage = (message: AssistantMessageProps) => {
  const { content, finish_reason, phase } = message;
  const [isLengthExceed, setIsLengthExceed] = useState(false);
  const [isContentFilter, setIsContentFilter] = useState(false);
  // 通过topMessage的finish 来判断是否可以操作
  const topMessage = useContext(BotMessageContext);
  const { assistantInfo, retryMessage } = useContext(ChatWindowContext);
  const { sendNextMessage, updateAutoNext } = useContext(RenderedMessagesContext);
  const assistantData = assistantInfo as Assistant & { Extra?: any };
  const findModelInfo = assistantData?.Extra?.Models?.find((item: any) => {
    if (Array.isArray(item.Used)) {
      return item.Used.includes(phase);
    }
    return false;
  });
  const modelInfo = {
    displayName: findModelInfo?.Name || '',
    modelName: findModelInfo?.ModelName || '',
    imgSrc: findModelInfo?.Icon || '',
  };

  const handleNext = async () => {
    if (topMessage.phase === VideoGeneratorTaskPhase.PhaseStoryBoard) {
      updateAutoNext(true);
    }
    if (topMessage.phase === VideoGeneratorTaskPhase.PhaseScript) {
      sendNextMessage('生成分镜脚本', false);
    } else {
      sendNextMessage('开始生成视频', false);
    }
  };

  useEffect(() => {
    if (finish_reason === 'length') {
      setIsLengthExceed(true);
    } else if (finish_reason === 'content_filter') {
      setIsContentFilter(true);
    }
  }, [finish_reason]);

  return (
    <div
      className={clsx(
        `mb-[20px] break-all assistant-message-container bg-white rounded-lg border p-[16px] ${styles.assistantMdBoxContainer}`,
      )}
    >
      {isContentFilter ? (
        <MessageContent message={responseForTextRiskReplace.modelResponse} isAnimate={!topMessage.finish} />
      ) : (
        <MessageContent message={content} isAnimate={!topMessage.finish} />
      )}
      {isLengthExceed ? (
        <Alert
          className="mt-[8px]"
          type="warning"
          content={
            '当前对话前后文信息已达该模型 tokens 数上限，输出文本可能不完整。建议您可以减少输入文本长度'
          }
        />
      ) : null}
      <div className={styles.footWrapper}>
        <div className={styles.operation}>
          {topMessage.finish && topMessage.isLastMessage ? (
            <div className={styles.button}>
              <MessageBranchChecker message={message} />
              <IconRefresh fontSize={16} onClick={retryMessage} style={{ cursor: 'pointer' }} />
            </div>
          ) : null}
        </div>
        <div className={styles.info}>
          {modelInfo?.modelName ? (
            <div className={styles.model}>
              <img src={modelInfo?.imgSrc || DoubaoImg} />
              <div className={styles.name}>{modelInfo?.displayName}</div>
            </div>
          ) : null}
        </div>
      </div>
      {topMessage.finish && topMessage.isLastMessage && topMessage.phase ? (
        <ColorfulButton className={styles.operateButton} mode="active" onClick={handleNext}>
          {topMessage.phase === VideoGeneratorTaskPhase.PhaseScript ? (
            <div className={styles.operateWrapper}>
              <IconAiEdit className={styles.operateIcon} />
              {'生成分镜脚本'}
            </div>
          ) : (
            <div className={styles.operateWrapper}>
              <IconAiBulb className={styles.operateIcon} />
              {'开始生成视频'}
            </div>
          )}
        </ColorfulButton>
      ) : null}
    </div>
  );
};

export default AssistantMessage;

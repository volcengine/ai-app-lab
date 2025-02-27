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

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { Notification } from '@arco-design/web-react';

import icon_user_avatar from '@/images/icon_user_avatar.svg';
import { Assistant } from '@/types/assistant';
import {
  botErrorCodesMessageMap,
  getErrorContent,
  isNormalSSEError,
  isTextRiskError,
  responseForTextRiskReplace,
} from '@/constant';

import { BotMessage, ChatWindowContext, EMessageType, finish_reason, Message, UserMessage } from './context';
import { filterValidMsg } from './utils/filterValidMsg';
import {
  updateBotMessageVersions,
  updateLoadingMessage,
  updateTargetMessage,
  updateVersionsWithExtrasAndMessages,
} from './hooks/updateMessage';
import { genSpecificMessage, markLastAssistantMessage, messageCreator, MessageOptions } from './addMessage';
import { textRiskTypeContentMap } from './constants';
import { sendMessageAndUpdateState, SSEError } from './sendMessageAndUpdateState';
import { EventSourceOpenFail } from './BetterEventSource';

interface IProps {
  children: ReactNode;
  onSendMessage?: () => void;
  assistant: Assistant;
  url: string;
}

interface RawMessage {
  content: string;

  /**
   * @default false
   */
  finish?: boolean;
  finish_reason?: finish_reason;
  usage?: Message['usage'];

  type?: Message['type'];

  logid?: Message['logid'];
  extra?: Record<string, any>; // 存放额外信息
}

export type UpdateAssistantResponse = (rawMessage: RawMessage) => void;

const searchingText = '正在搜索';

export const ChatWindowV2 = ({ children, onSendMessage, assistant, url }: IProps) => {
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<(UserMessage | BotMessage)[]>([]);

  const abortRef = useRef(new AbortController());
  const messagesRef = useRef<(UserMessage | BotMessage)[]>(messages);
  // 记录更新 bot response 的 message id
  const updateBotMessageIdRef = useRef(-1);

  /**
   * 添加一条新消息
   */
  const addMessage = useCallback((role: 'user' | 'bot', options: MessageOptions): void => {
    setMessages(messages => {
      // 更新上一个回答 负责展示的 attrs
      const modifiedMessages = markLastAssistantMessage(messages); // Assume markLastAssistantMessage exists
      // 拿到新的 msg
      const newMessage = messageCreator[role](options);
      return [...modifiedMessages, newMessage];
    });
  }, []);

  const insertBotEmptyMessage = (character?: { name?: string; avatar?: string }) => {
    // 新增 BotMessage
    // +1 是为了区分,否则2个id一模一样
    const newMessageId = Date.now() + 1;
    // 设置用于更新的id
    updateBotMessageIdRef.current = newMessageId;
    addMessage('bot', {
      versions: [[genSpecificMessage.loading(), genSpecificMessage.slot(newMessageId)]],
      character,
    });
  };

  const sendMessageFromInput = useCallback(
    (content: string) => {
      // 从这里发送的消息一定是一个用户的消息，所以我们将用户消息添加到消息列表即可
      addMessage('user', {
        content,
        character: {
          name: '', // 如果没有就不传，前端会兜底展示 “我”
          avatar: icon_user_avatar,
        },
      });
    },
    [addMessage],
  );

  const sendMessageImplicitly = useCallback(
    (content: string) => {
      // 从这里发送的消息一定是一个用户的消息，所以我们将用户消息添加到消息列表即可
      addMessage('user', {
        content,
        character: {
          name: '', // 如果没有就不传，前端会兜底展示 “我”
          avatar: icon_user_avatar,
          isHidden: true,
        },
      });
    },
    [addMessage],
  );

  /**
   * 更新 Bot 回复
   * @description 注意：会出现多次 finish的情况
   */
  const updateAssistantResponse: (
    id: number,
    successCb?: (messages: (UserMessage | BotMessage)[]) => void,
  ) => UpdateAssistantResponse = useCallback(
    (id: number, successCb?: (messages: (UserMessage | BotMessage)[]) => void) =>
      ({ content, finish = false, finish_reason, logid, usage, type = EMessageType.Message, extra }) => {
        // 是否有效,最少得有下面字段中的一个
        const isRespValid = Boolean(content || finish_reason || usage);
        if (!isRespValid) {
          return;
        }
        // 找到最后一条Assistant消息，Version[currentVersion] 是一个数组
        const messages = messagesRef.current;
        // findLastIndex es2023
        const lastBotMessageIndex = messages.findLastIndex(message => message.role === 'assistant');
        const lastBotMessage = messages[lastBotMessageIndex] as BotMessage | undefined;

        if (!lastBotMessage) {
          throw Error('lastBotMessage is undefined');
        }

        const targetMsgVersions = [...lastBotMessage.versions[lastBotMessage.currentVersion]];

        const targetMsgIdx = targetMsgVersions.findIndex(message => message.id === id);
        if (targetMsgIdx === -1) {
          throw Error('targetMessage is undefined');
        }

        // 要更新内容的message
        const targetMsg = targetMsgVersions[targetMsgIdx];

        const loadingMsgIdx = targetMsgIdx - 1;
        // 要更新状态的loading msg
        const loadingMsg = targetMsgVersions[loadingMsgIdx];

        // 处理loading / searching
        const showSearching = content === searchingText;

        const isHasContent = !showSearching && Boolean(content.startsWith(searchingText) ? content.slice(4) : content);
        const updatedLoadingMsg = updateLoadingMessage(loadingMsg, showSearching, isHasContent);

        const isUseSearch = content === searchingText || updatedLoadingMsg.content === searchingText;

        const updatedTargetMsg = updateTargetMessage(
          targetMsg,
          isUseSearch,
          content,
          finish,
          finish_reason,
          type as EMessageType,
          logid,
          usage,
        );

        // 拼装versions
        const updatedVersions = updateVersionsWithExtrasAndMessages(updatedLoadingMsg, updatedTargetMsg);

        // 最终更新的数据
        const newLastAssistantMessage = updateBotMessageVersions(lastBotMessage, updatedVersions, finish, extra);

        // 在setMessages 更新lastAssistantMessage的versions,
        setMessages(prevMessages =>
          prevMessages.map((message, index) => (index === lastBotMessageIndex ? newLastAssistantMessage : message)),
        );

        //  回答结束后 设置 sending 状态
        if (finish) {
          // 如果finish就允许发送
          setSending(false);
          // 回调
          const msgs = messages.map((msg, index) => (index === lastBotMessageIndex ? newLastAssistantMessage : msg));

          successCb?.(msgs);
        }

        // 更新状态以显示回复
        // 更新最后一个非用户的消息，如果没有则创建
      },
    [messages],
  );

  /**
   * 重置消息
   */
  const resetMessage = useCallback(() => {
    setMessages([]);
    setSending(false);
    abortRef.current.abort();
    abortRef.current = new AbortController();
  }, [messages]);

  /**
   * 获取 bot api 所需的 Message 字段
   */
  const getMeaningfulMessages = useCallback(() => {
    const messages = messagesRef.current;

    return filterValidMsg(messages);
  }, []);

  const startReply = async () => {
    const meaningfulMessages = getMeaningfulMessages();

    // console.log('#startReply', meaningfulMessages, messages);
    const body = {
      messages: [...meaningfulMessages],
      model: '',
      stream: true,
    };

    onSendMessage?.();
    setSending(true);

    const updateTargetMessage = updateAssistantResponse(updateBotMessageIdRef.current);

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const updateTargetDebugInfo = () => {};

    // 发送消息
    try {
      await sendMessageAndUpdateState(url, body, updateTargetMessage, updateTargetDebugInfo, abortRef.current.signal);
    } catch (error: unknown) {
      // 重置 AbortController
      abortRef?.current.abort('error');
      abortRef.current = new AbortController();

      console.error(error);

      // 单独处理终止错误，由于 AbortController 的 abort 方法会抛出异常
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      // 开始处理错误
      // EventSourceOpenFail
      if (error instanceof EventSourceOpenFail) {
        // 链接没有建立成功，直接显示错误
        updateTargetMessage(
          genSpecificMessage.error(
            EMessageType.Error,
            error?.message || botErrorCodesMessageMap.ConnectionEstablishmentFailed,
            error.logid,
          ),
        );

        setSending(false);

        if (error.ResponseMetadata) {
          Notification.error({ content: error.ResponseMetadata.Error.Message });
        }
        return;
      }

      if (isNormalSSEError(error)) {
        if (isTextRiskError(error)) {
          const { type = EMessageType.Error, content = responseForTextRiskReplace.modelResponse } =
            textRiskTypeContentMap[error.code as keyof typeof textRiskTypeContentMap] || {};

          updateTargetMessage(genSpecificMessage.error(type as EMessageType.Message | EMessageType.Error, content));
        } else {
          updateTargetMessage(
            genSpecificMessage.error(EMessageType.Error, getErrorContent(error as SSEError), error.logid),
          );
        }

        setSending(false);
        return;
      }
      // 未知错误
      updateTargetMessage(
        genSpecificMessage.error(
          EMessageType.Error,
          (error as any)?.message ||
            '发生意外错误，请联系管理员',
          (error as any)?.logid,
        ),
      );

      setSending(false);
      return;
    }
  };

  const retryMessage = () => {
    const retryBotMessage = messages[messages.length - 1];

    if (retryBotMessage.role !== 'assistant') {
      throw new Error('retryMessage: last message is not a bot message');
    }

    const newMessageId = Date.now() + 1;

    // 设置用于更新的id
    updateBotMessageIdRef.current = newMessageId;

    retryBotMessage.versions.push([genSpecificMessage.loading(), genSpecificMessage.slot(newMessageId)]);

    retryBotMessage.currentVersion = retryBotMessage.versions.length - 1;

    // 构造新对象
    messages[messages.length - 1] = { ...retryBotMessage };

    setMessages([...messages]);

    startReply();
  };

  const removeLoadingCardInVersions = (versionIdx: number) => {
    const messages = messagesRef.current;
    // 找到最后一个assistantMsg
    const lastAssistantMessageIndex = messages.findLastIndex(message => message.role === 'assistant');
    const lastAssistantMsg = messages[lastAssistantMessageIndex] as BotMessage | null;
    if (!lastAssistantMsg) {
      throw new Error('removeLoadingCardInVersions: last bot message not found');
    }

    // 找到目标version
    const targetVersion = lastAssistantMsg.versions[versionIdx];

    const processedVersion = targetVersion.reduce((acc: Message[], message: Message) => {
      // filter loading卡片
      if (message.type === 'searching') {
        return acc;
      }
      // 如果存在 type === 'weather_card' 或 type === 'card' 则设置对应卡片 enableAnimate=false
      if (message.type === 'weather_card' || message.type === 'cards') {
        const modifiedMessage = {
          ...message,
          enableAnimate: false,
        };
        acc.push(modifiedMessage);
      } else {
        // 对于其它类型，直接加入结果列表
        acc.push(message);
      }

      return acc;
    }, []);
    // console.log('#processedVersion', targetVersion, processedVersion);
    // 更新version
    lastAssistantMsg.versions[versionIdx] = processedVersion;
    // 更新currentVersion
    lastAssistantMsg.currentVersion = versionIdx;
    // 更新message
    messages[lastAssistantMessageIndex] = lastAssistantMsg;
    setMessages(messages);
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  return (
    <ChatWindowContext.Provider
      value={{
        messages,
        setMessages,
        sending,
        resetMessage,
        startReply,
        sendMessageFromInput,
        sendMessageImplicitly,
        insertBotEmptyMessage,
        retryMessage,
        removeLoadingCardInVersions,
        assistantInfo: assistant,
      }}
    >
      {children}
    </ChatWindowContext.Provider>
  );
};

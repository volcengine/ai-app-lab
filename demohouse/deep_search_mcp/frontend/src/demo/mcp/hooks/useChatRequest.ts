import { useCallback, useRef } from 'react';

import { Message } from '@arco-design/web-react';
import { v4 as uuidv4 } from 'uuid';

import { useChatInstance } from '@/demo/mcp/hooks/useInstance';
import { useChatConfigStore } from '@/demo/mcp/store/ChatConfigStore/useChatConfigStore';

import { startChat } from '../api';
import { useCanvasStore } from '../store/CanvasStore';
import { EventType } from '../types/event';
import type { Message as MessageType, Reference } from '../types/message';
import type { CustomError } from '../utils/PostSSE';
import { getChatMcpServers } from '../utils/getChatMcpServers';
import { pascalKeysToSnake } from '../utils/transform';

interface ApiResponse {
  id: string;
  choices: {
    delta: {
      content: string;
      reasoning_content?: string;
      role: string;
    };
    finish_reason: string;
  }[];
  metadata: {
    session_id: string;
    event?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  usage?: any;
  bff_extra_info?: any;
  references?: Reference[];
}

export const useChatRequest = () => {
  const {
    botId,
    url,
    addChatMessage,
    updateChatMessage,
    getLastUserMessage,
    getLastBotMessage,
    updateIsChatting,
    recoverToCompleteStep,
    getHeader,
    chatConfig,
  } = useChatInstance();
  const { maxPlanningRounds } = useChatConfigStore();
  const setCanvasData = useCanvasStore(state => state.setData);
  const setShowCanvas = useCanvasStore(state => state.setShowCanvas);
  const setCurrentType = useCanvasStore(state => state.setCurrentType);
  const contentRef = useRef('');
  const reasoningContentRef = useRef('');
  const typeRef = useRef('');
  const logIdRef = useRef('');
  const closeRequest = useRef<() => void>();

  const convertErrorMessage = (err: any) => {
    const { code, message } = err;
    switch (code) {
      case 'BFFPromptTextExistRisk':
        return '输入文本包含敏感信息，请更换话题后进行重试';
      case 'BFFResponseTextExistRisk':
        return '输出文本包含敏感信息，请更换话题后进行重试';
      default:
        return message;
    }
  };

  const handleContent = (response: any): any => {
    const { content } = response;
    const status = 'pending';
    contentRef.current = contentRef.current + content;
    return { status, result: contentRef.current };
  };

  const handleReasoningContent = (response: any): any => {
    const { reasoningContent } = response;
    const status = 'pending';
    reasoningContentRef.current =
      reasoningContentRef.current + reasoningContent;
    return { status, result: reasoningContentRef.current };
  };

  const handleOtherData = (response: any): any => {
    const { event } = response;
    return { result: { ...event } };
  };

  const handleNeedHistoryData = (response: any, uniqueKey: string): any => {
    const { event } = response;
    const status = 'pending';
    return {
      status,
      id: event[uniqueKey],
      result: { ...event },
      history: [{ ...event }],
    };
  };

  const handleResponseByType = (response: any): any => {
    const { type } = response;
    switch (type) {
      case EventType.ReasoningText: {
        return handleReasoningContent(response);
      }
      case EventType.OutputText: {
        return handleContent(response);
      }
      case EventType.Planning: {
        return handleOtherData(response);
      }
      case EventType.BrowserUse: {
        return handleNeedHistoryData(response, 'task_id');
      }
      case EventType.ChatPPT: {
        return handleNeedHistoryData(response, 'ppt_id');
      }
      default: {
        return handleOtherData(response);
      }
    }
  };

  const resetState = useCallback(() => {
    updateIsChatting(false);
    contentRef.current = '';
    reasoningContentRef.current = '';
    typeRef.current = '';
    logIdRef.current = '';
    closeRequest.current = undefined;
    // getAmountConfig();
  }, [updateIsChatting]);

  // fetch
  // 接口报错
  // 文本审核
  const handleError = useCallback(
    async (msgId: string, err: Error | CustomError) => {
      const errMsg = convertErrorMessage(err);
      const isRecover = await recoverToCompleteStep(msgId);
      if (isRecover) {
        updateChatMessage(msgId, prevMessage => {
          const { events } = prevMessage;
          if (!events) {
            return {
              ...prevMessage,
              finish: true,
              events: [
                {
                  id: uuidv4(),
                  type: 'error',
                  result: errMsg,
                },
              ],
            };
          }
          events?.push({
            id: uuidv4(),
            type: 'error',
            result: errMsg,
          });
          return {
            ...prevMessage,
            finish: true,
            events,
          };
        });
      } else {
        updateChatMessage(msgId, prevMessage => ({
          ...prevMessage,
          finish: true,
          type: 'error',
          content: errMsg,
          events: [],
        }));
      }
      resetState();
    },
    [recoverToCompleteStep, resetState, updateChatMessage],
  );

  const abortMessage = useCallback(() => {
    closeRequest.current?.();
    closeRequest.current = undefined;
    contentRef.current = '';
    reasoningContentRef.current = '';
    typeRef.current = '';
    logIdRef.current = '';
    updateIsChatting(false);
  }, []);

  const handleChatResponse = useCallback(
    (msgId: string, data: string) => {
      try {
        const apiResponse: ApiResponse = JSON.parse(data);
        // 处理不过审
        if (apiResponse.error) {
          handleError(msgId, apiResponse.error);
          return;
        }

        // 空包，跳过
        if (apiResponse.bff_extra_info?.keep_alive === true) {
          return;
        }

        const { id, choices = [], metadata, usage } = apiResponse;
        const content = choices?.[0]?.delta?.content ?? '';
        const reasoningContent = choices?.[0]?.delta?.reasoning_content ?? '';
        const finishReason = choices?.[0]?.finish_reason;
        const sessionId = metadata?.session_id;
        const event = metadata?.event ? JSON.parse(metadata?.event) : undefined;
        let type = '';

        // 到终点了
        if (finishReason) {
          updateChatMessage(msgId, prevMessage => ({
            ...prevMessage,
            references: apiResponse?.references || [],
            usage,
          }));
          return;
        }

        if (event) {
          type = event.type;
        } else {
          if (reasoningContent) {
            type = EventType.ReasoningText;
          } else if (content) {
            type = EventType.OutputText;
          }
        }

        if (!type) {
          return;
        }

        // init
        if (!typeRef.current) {
          typeRef.current = type;
        }

        const eventResult = handleResponseByType({
          type,
          content,
          reasoningContent,
          event,
        });
        const newEvent = {
          id: uuidv4(),
          type,
          ...eventResult,
        };
        if (
          type !== EventType.ReasoningText &&
          type !== EventType.OutputText &&
          type !== EventType.Planning &&
          type !== EventType.AssignTodo &&
          eventResult.result?.status === 'completed'
        ) {
          // 更新画布数据
          setCanvasData(sessionId, newEvent);
        } else if (
          type === EventType.BrowserUse ||
          type === EventType.ChatPPT
        ) {
          setCanvasData(sessionId, newEvent);
        }

        updateChatMessage(msgId, prevMessage => {
          const { events } = prevMessage;
          if (!events || events.length === 0) {
            return {
              ...prevMessage,
              events: [
                {
                  id: uuidv4(),
                  type,
                  ...eventResult,
                },
              ],
            };
          }

          const latestEvent = events[events.length - 1];

          // browser use，chatppt，特殊处理 history
          // 若历史 id 为空，说明是 pending 事件，与后面同类型事件合并
          if (
            latestEvent.type === type &&
            latestEvent.history &&
            (!latestEvent.id || latestEvent.id === newEvent.id)
          ) {
            const history = [...latestEvent.history, ...newEvent.history];
            return {
              ...prevMessage,
              events: [
                ...events.slice(0, -1),
                { ...latestEvent, ...eventResult, history },
              ],
            };
          }

          if (
            latestEvent.type === type &&
            latestEvent.status === 'pending' &&
            !latestEvent.history
          ) {
            // 处理 reasoning_content、output_text 情况
            return {
              ...prevMessage,
              events: [
                ...events.slice(0, -1),
                { ...latestEvent, ...eventResult },
              ],
            };
          } else if (
            latestEvent.type !== type &&
            latestEvent.status === 'pending'
          ) {
            latestEvent.status = 'finish';
            if (latestEvent.type === EventType.ReasoningText) {
              reasoningContentRef.current = '';
            }
            if (latestEvent.type === EventType.OutputText) {
              contentRef.current = '';
            }
            if (
              latestEvent.type === EventType.BrowserUse ||
              latestEvent.type === EventType.ChatPPT
            ) {
              setCanvasData(sessionId, {
                id: latestEvent.id,
                type: latestEvent.type,
                status: 'finish',
              });
            }
          }

          return {
            ...prevMessage,
            sessionId,
            logId: logIdRef.current || id,
            requestId: id,
            events: [...events, newEvent],
          };
        });

        // 任务规划完成时，打断，让用户选择继续/修改
        // 任务不清晰时，也需要打断
        // 本地测试时，代理会阻塞 sse 的传输。测试时注释相关代码或者起 local bff
        // FIXME: 本地测试时，不打断
        if (
          type === EventType.Planning &&
          (newEvent.result?.action === 'made' ||
            newEvent.result?.action === 'denied')
        ) {
          abortMessage();
          updateChatMessage(msgId, prevMessage => ({
            ...prevMessage,
            finish: true,
          }));
        }
      } catch (error) {
        updateChatMessage(msgId, prevMessage => ({
          ...prevMessage,
          finish: true,
          type: 'error',
          content: '',
        }));
      }
    },
    [updateChatMessage],
  );

  const handleChatEnd = useCallback(
    (msgId: string) => {
      updateChatMessage(msgId, prevMessage => {
        const { events } = prevMessage;
        if (events && events[events.length - 1]?.status === 'pending') {
          events[events.length - 1].status = 'finish';
        }
        return { ...prevMessage, finish: true };
      });
      resetState();
    },
    [resetState, updateChatMessage],
  );

  const handleHeader = useCallback((headers: Headers) => {
    logIdRef.current = headers.get('x-tt-logid') || '';
  }, []);

  const sendUserMsg = useCallback(
    (content: string) => {
      const userMsgId = uuidv4();

      // 关闭画布区域
      setShowCanvas(false);
      // 重置一下画布的 Type
      setCurrentType('follow');

      // 清空输入框
      addChatMessage({
        id: userMsgId,
        role: 'user',
        content,
        finish: true,
        type: 'text',
      });

      const botMsgId = uuidv4();
      addChatMessage({
        id: botMsgId,
        role: 'assistant',
        content: '',
        finish: false,
        // FIXME：本地测试
        // type: process.env.NODE_ENV === 'development' ? 'mcp' : 'pre-mcp',
        type: 'pre-mcp',
        events: [],
        sessionQuery: content, // 存放任务的query
      });
      // 更新状态
      updateIsChatting(true);

      // 发送请求
      closeRequest.current = startChat({
        url,
        body: JSON.stringify(
          pascalKeysToSnake({
            model: '',
            stream: true,
            Metadata: {
              max_plannings: maxPlanningRounds,
              mcp_servers: getChatMcpServers(),
            },
            ChatConfig: chatConfig,
            Messages: [
              {
                content: content,
                role: 'user',
              },
            ],
          }),
        ),
        customHeaders: getHeader?.()?.bff,
        onMessage: data => handleChatResponse(botMsgId, data),
        onEnd: () => handleChatEnd(botMsgId),
        onHeader: headers => {
          handleHeader(headers);
        },
        onError: error => handleError(botMsgId, error),
      });

      return {
        botMsgId,
      };
    },
    [
      addChatMessage,
      botId,
      url,
      maxPlanningRounds,
      chatConfig,
      getHeader,
      handleChatResponse,
      handleChatEnd,
      handleHeader,
      handleError,
    ],
  );

  const retryMessage = useCallback(() => {
    const userMessage = getLastUserMessage();
    if (!userMessage) {
      Message.error('没有找到用户消息');
      return;
    }

    const botMessage = getLastBotMessage();

    updateIsChatting(true);
    // 关闭画布区域
    setShowCanvas(false);

    // 如果 botMessage 里最后一个是错误事件或者暂停事件，则从当前开始重试
    if (botMessage) {
      const { id } = botMessage;
      const lastEvent = botMessage.events?.[botMessage.events.length - 1];
      if (lastEvent?.type === 'error' || lastEvent?.type === 'manual-pause') {
        console.log(`[retryMessage] retry by last ${lastEvent.type} event`);
        // 移除错误事件
        updateChatMessage(id, prevMessage => {
          const { events } = prevMessage;
          if (!events || events.length === 0) {
            return {
              ...prevMessage,
              events: [],
            };
          }
          return {
            ...prevMessage,
            finish: false,
            events: events.slice(0, -1),
          };
        });
        // 发起请求
        closeRequest.current = startChat({
          url,
          body: JSON.stringify(
            pascalKeysToSnake({
              model: '',
              stream: true,
              Metadata: {
                session_id: botMessage.sessionId,
              },
              Messages: [
                {
                  content: userMessage.content,
                  role: 'user',
                },
              ],
            }),
          ),
          customHeaders: getHeader?.()?.bff,
          onMessage: data => handleChatResponse(id, data),
          onEnd: () => handleChatEnd(id),
          onHeader: headers => {
            handleHeader(headers);
          },
          onError: error => handleError(id, error),
        });

        return;
      }
    }

    if (botMessage?.type !== 'error' && botMessage?.type !== 'manual-pause') {
      console.log('[retryMessage] retry by normal');
      // 正常事件，开始新一轮对话
      addChatMessage({
        id: uuidv4(),
        role: 'user',
        content:
          botMessage?.sessionQuery ||
          userMessage.sessionQuery ||
          userMessage.content,
        finish: true,
        type: 'text',
      });

      const botMsgId = uuidv4();
      addChatMessage({
        id: botMsgId,
        role: 'assistant',
        content: '',
        finish: false,
        type: 'pre-mcp',
        events: [],
      });

      // 发起请求
      closeRequest.current = startChat({
        url,
        body: JSON.stringify(
          pascalKeysToSnake({
            model: '',
            stream: true,
            Metadata: {
              max_plannings: maxPlanningRounds,
              mcp_servers: getChatMcpServers(),
            },
            Messages: [
              {
                content: userMessage.content,
                role: 'user',
              },
            ],
          }),
        ),
        customHeaders: getHeader?.()?.bff,
        onMessage: data => handleChatResponse(botMsgId, data),
        onEnd: () => handleChatEnd(botMsgId),
        onHeader: headers => {
          handleHeader(headers);
        },
        onError: error => handleError(botMsgId, error),
      });
      return;
    }

    // 由错误/暂停事件引起，重新发起上一轮对话，需要判断上一轮是 pre-mcp 还是 mcp
    const botMsgId = uuidv4();
    addChatMessage({
      id: botMsgId,
      role: 'assistant',
      content: '',
      finish: false,
      type: userMessage.sessionQuery ? 'mcp' : 'pre-mcp',
      events: [],
    });
    if (userMessage.sessionQuery) {
      console.log(
        '[retryMessage] retry by error or manual-pause, retry from session',
      );
      closeRequest.current = startChat({
        url,
        body: JSON.stringify(
          pascalKeysToSnake({
            model: '',
            stream: true,
            Metadata: {
              session_id: botMessage.sessionId,
            },
            Messages: [
              {
                content: userMessage.sessionQuery,
                role: 'user',
              },
            ],
          }),
        ),
        customHeaders: getHeader?.()?.bff,
        onMessage: data => handleChatResponse(botMsgId, data),
        onEnd: () => handleChatEnd(botMsgId),
        onHeader: headers => {
          handleHeader(headers);
        },
        onError: error => handleError(botMsgId, error),
      });
    } else {
      console.log(
        '[retryMessage] retry by error or manual-pause, retry from new message',
      );
      closeRequest.current = startChat({
        url,
        body: JSON.stringify(
          pascalKeysToSnake({
            model: '',
            stream: true,
            Metadata: {
              max_plannings: maxPlanningRounds,
              mcp_servers: getChatMcpServers(),
            },
            Messages: [
              {
                content: userMessage.content,
                role: 'user',
              },
            ],
          }),
        ),
        customHeaders: getHeader?.()?.bff,
        onMessage: data => handleChatResponse(botMsgId, data),
        onEnd: () => handleChatEnd(botMsgId),
        onHeader: headers => {
          handleHeader(headers);
        },
        onError: error => handleError(botMsgId, error),
      });
    }
  }, [
    botId,
    getLastUserMessage,
    handleChatEnd,
    handleChatResponse,
    handleError,
    handleHeader,
    maxPlanningRounds,
    url,
  ]);

  const startTask = useCallback(() => {
    const userMessage = getLastUserMessage();
    if (!userMessage) {
      return;
    }
    const lastBotMessage = getLastBotMessage();
    if (!lastBotMessage) {
      return;
    }

    const { content } = userMessage;
    const { sessionId } = lastBotMessage;

    updateIsChatting(true);

    addChatMessage({
      id: uuidv4(),
      role: 'user',
      content: '开始任务',
      finish: true,
      type: 'text',
      sessionQuery: content, // 存放任务的query
    });

    const botMsgId = uuidv4();
    addChatMessage({
      id: botMsgId,
      role: 'assistant',
      content: '',
      finish: false,
      type: 'mcp',
      events: [],
      sessionQuery: content, // 存放任务的query
    });

    // 发送请求
    closeRequest.current = startChat({
      url,
      body: JSON.stringify(
        pascalKeysToSnake({
          model: '',
          stream: true,
          Metadata: {
            session_id: sessionId,
          },
          ChatConfig: chatConfig,
          Messages: [
            {
              content,
              role: 'user',
            },
          ],
        }),
      ),
      customHeaders: getHeader?.()?.bff,
      onMessage: data => handleChatResponse(botMsgId, data),
      onEnd: () => handleChatEnd(botMsgId),
      onHeader: headers => {
        handleHeader(headers);
      },
      onError: error => handleError(botMsgId, error),
    });

    return {
      botMsgId,
    };
  }, [
    addChatMessage,
    botId,
    chatConfig,
    getHeader,
    getLastBotMessage,
    getLastUserMessage,
    handleChatEnd,
    handleChatResponse,
    handleError,
    handleHeader,
    url,
  ]);

  const continueMessage = useCallback(
    (messages: MessageType[]) => {
      const lastBotMessage = messages.findLast(
        item => item.role === 'assistant',
      );

      if (!lastBotMessage) {
        return;
      }
      if (lastBotMessage.finish) {
        return;
      }

      const userMessage = messages.findLast(item => item.role === 'user');
      if (!userMessage) {
        Message.error('没有找到用户消息');
        return;
      }

      if (!lastBotMessage?.sessionId) {
        Message.error('没有 Session 信息');
        return;
      }

      const { id } = lastBotMessage;
      console.log('continueMessage', lastBotMessage);

      // 更新状态
      updateIsChatting(true);
      // 发起请求
      closeRequest.current = startChat({
        url,
        body: JSON.stringify(
          pascalKeysToSnake({
            model: '',
            stream: true,
            Metadata: {
              session_id: lastBotMessage.sessionId,
            },
            Messages: [
              {
                content: userMessage.content,
                role: 'user',
              },
            ],
          }),
        ),
        customHeaders: getHeader?.()?.bff,
        onMessage: data => handleChatResponse(id, data),
        onEnd: () => handleChatEnd(id),
        onHeader: headers => {
          handleHeader(headers);
        },
        onError: error => handleError(id, error),
      });
    },
    [botId, handleChatEnd, handleChatResponse, handleError, handleHeader, url],
  );

  const pauseMessage = useCallback(async (msgId: string) => {
    const isRecover = await recoverToCompleteStep(msgId);
    if (isRecover) {
      updateChatMessage(msgId, prevMessage => {
        const { events } = prevMessage;
        if (!events) {
          return {
            ...prevMessage,
            finish: true,
            events: [
              {
                id: uuidv4(),
                type: 'manual-pause',
                result: '已暂停，点击重试按钮可继续当前步骤',
              },
            ],
          };
        }
        events?.push({
          id: uuidv4(),
          type: 'manual-pause',
          result: '已暂停，点击重试按钮可继续当前步骤',
        });
        return {
          ...prevMessage,
          finish: true,
          events,
        };
      });
    } else {
      updateChatMessage(msgId, prevMessage => ({
        ...prevMessage,
        finish: true,
        type: 'manual-pause',
        content: '已暂停，点击重试按钮可继续当前步骤',
        events: [],
      }));
    }
    abortMessage();
  }, []);

  return {
    sendUserMsg,
    retryMessage,
    abortMessage,
    continueMessage,
    startTask,
    pauseMessage,
  };
};

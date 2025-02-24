import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { MdMic, MdContentCopy, MdStop } from 'react-icons/md';
import { AiOutlineLike, AiOutlineDislike } from 'react-icons/ai';
import { BiVolumeFull, BiSearch } from 'react-icons/bi';
import { useGesture } from '@use-gesture/react';
import { createLLMRequest } from '../../api/llm';
import { BsSoundwave } from 'react-icons/bs';
import { createStreamingTTS, appendStreamingTTS, cancelStreamingTTS, onTTSFinished, copyMessage, likeMessage } from '../../api/bridge';
import { startASR, stopASR, onASRResult } from '@ai-app/multimodal-api';
import { BsCheckCircleFill } from 'react-icons/bs';
import SearchIcon from './SearchIcon';
import CheckIcon from './CheckIcon';
import VolumeIcon from './VolumeIcon';
import CopyIcon from './CopyIcon';
import LikeIcon from './LikeIcon';
import DislikeIcon from './DislikeIcon';
import WaveIcon from './WaveIcon';
import ReasoningBlock from './ReasoningBlock';
import ASRLogo from '../../image/logo_asr.png';

export interface Message {
  id: number;
  type: string; // 'user' | 'bot'
  content: string;
  status?: 'searching' | 'completed';
  image?: string;
  ttsStreamingId?: string;
  isPlaying?: boolean;
  reasoningContent?: string;
  thinkingTime?: number;
}

interface ChatInterfaceProps {
  initialMessages: Message[];
  apiKey?: string[];
}

let messageIdCounter = 0;

const ChatInterface: React.FC<ChatInterfaceProps> = ({ initialMessages, apiKey }) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isRecording, setIsRecording] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const currentASRTextRef = useRef('');
  const [userScrolling, setUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messageListRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const currentLLMRequestRef = useRef<AbortController | null>(null);
  const [isAIAssistMode, setIsAIAssistMode] = useState(false);

  const stopAllTTS = async () => {
    const playingMessages = messages.filter(msg => msg.isPlaying && msg.ttsStreamingId);
    for (const msg of playingMessages) {
      if (msg.ttsStreamingId) {
        try {
          await cancelStreamingTTS({ streamingId: msg.ttsStreamingId });
        } catch (error) {
          console.error('cancelStreamingTTS failed', error)
        }
      }
    }
    setMessages(prev => prev.map(msg => 
      msg.isPlaying ? { ...msg, isPlaying: false, ttsStreamingId: undefined } : msg
    ));
  };

  const handleUserMessage = async (content: string, image?: string, isFromInitial: boolean = false) => {
    setIsResponding(true);
    const abortController = new AbortController();
    currentLLMRequestRef.current = abortController;

    // 判断是否为 AI 帮写场景
    const useDeepSeek = isAIAssistMode || (isFromInitial && messages[0]?.content === "AI帮写");
    if (useDeepSeek) {
      setIsAIAssistMode(true);
    }
    console.log(`handleUserMessage useDeepSeek=${useDeepSeek} apiKey=${apiKey} ${typeof apiKey}`)

    // 获取最近的历史消息(不包括当前的用户消息和机器人回复)
    const recentMessages = isFromInitial ? [] : messages.slice(-5);

    const botMessage: Message = {
      id: ++messageIdCounter,
      type: 'bot',
      content: '',
      status: 'searching',
      isPlaying: false,
      ...(useDeepSeek && { reasoningContent: '' })
    };

    setMessages(prev => [...prev, botMessage]);

    let ttsStreamingId: string | undefined;
    let pendingChunks: string[] = [];

    const processPendingChunks = async () => {
      if (ttsStreamingId && pendingChunks.length > 0) {
        const chunk = pendingChunks.shift()!;
        await appendStreamingTTS({
          streamingId: ttsStreamingId,
          newText: chunk,
          isFinish: false
        });
      }
    };

    const initTTS = async () => {
      const { streamingId } = await createStreamingTTS({});
      ttsStreamingId = streamingId;
      setMessages(prev => prev.map(msg => 
        msg.id === botMessage.id ? { ...msg, isPlaying: true, ttsStreamingId } : msg
      ));
      while (pendingChunks.length > 0) {
        await processPendingChunks();
      }
    };

    initTTS();
    try {
      if (useDeepSeek) {
        let deepSeekRequest = '';
        if (isFromInitial) {
          deepSeekRequest = '请根据图片内容判断场景类型，并进行AI帮写，图片内容描述如下：\n';
          await new Promise<void>((resolve, reject) => {
            createLLMRequest(
              content,
              (chunk, reasoning) => {
                if (abortController.signal.aborted) return;
                deepSeekRequest += chunk;
              },
              () => {
                if (abortController.signal.aborted) return;
                resolve();
              },
              image,
              recentMessages,
              apiKey?.[0],
              'VLM'
            ).catch(reject);
          });
        } else {
          deepSeekRequest = content;
        }

        console.log(`deepSeekRequest ${deepSeekRequest}`);
        if (!abortController.signal.aborted) {
          await createLLMRequest(
            deepSeekRequest,
            async (chunk, reasoning) => {
              if (abortController.signal.aborted) return;
              // console.log(`DeepSeek onData c=${chunk} r=${reasoning}`);
              if (chunk) {
                // console.log(`DeepSeek onData pendingChunks.push=${chunk} ttsStreamingId=${ttsStreamingId}`);
                pendingChunks.push(chunk);
              }
              
              setMessages(prevMessages => {
                const lastMessage = prevMessages[prevMessages.length - 1];
                if (lastMessage.type === 'bot') {
                  return [
                    ...prevMessages.slice(0, -1),
                    {
                      ...lastMessage,
                      content: lastMessage.content + chunk,
                      reasoningContent: (lastMessage.reasoningContent ?? '') + (reasoning ?? ''),
                      isPlaying: lastMessage.isPlaying,
                      ttsStreamingId: lastMessage.ttsStreamingId
                    }
                  ];
                }
                return prevMessages;
              });

              if (chunk) {
                await processPendingChunks();
              }
            },
            async () => {
              console.log(`DeepSeek onComplete ttsStreamingId=${ttsStreamingId}`);
              if (abortController.signal.aborted) return;
              while (pendingChunks.length > 0) {
                await processPendingChunks();
              }

              if (ttsStreamingId) {
                await appendStreamingTTS({
                  streamingId: ttsStreamingId,
                  newText: '',
                  isFinish: true
                });
              }

              setMessages(prevMessages => {
                const lastMessage = prevMessages[prevMessages.length - 1];
                if (lastMessage.type === 'bot') {
                  return [
                    ...prevMessages.slice(0, -1),
                    {
                      ...lastMessage,
                      status: 'completed',
                      isPlaying: lastMessage.isPlaying,
                      ttsStreamingId: lastMessage.ttsStreamingId
                    }
                  ];
                }
                return prevMessages;
              });
              setIsResponding(false);
              currentLLMRequestRef.current = null;
            },
            undefined,
            recentMessages,
            apiKey?.[1],
            'DS'
          );
        }
      } else {
        // 非 AI 帮写场景，保持原有逻辑
        await createLLMRequest(
          content,
          async (chunk) => {
            if (abortController.signal.aborted) return;
            pendingChunks.push(chunk);

            setMessages(prevMessages => {
              const lastMessage = prevMessages[prevMessages.length - 1];
              if (lastMessage.type === 'bot') {
                return [
                  ...prevMessages.slice(0, -1),
                  {
                    ...lastMessage,
                    content: lastMessage.content + chunk,
                    isPlaying: lastMessage.isPlaying,
                    ttsStreamingId: lastMessage.ttsStreamingId
                  }
                ];
              }
              return prevMessages;
            });

            if (ttsStreamingId) {
              await processPendingChunks();
            }
          },
          async () => {
            if (abortController.signal.aborted) return;
            while (pendingChunks.length > 0) {
              await processPendingChunks();
            }

            if (ttsStreamingId) {
              await appendStreamingTTS({
                streamingId: ttsStreamingId,
                newText: '',
                isFinish: true
              });
            }

            setMessages(prevMessages => {
              const lastMessage = prevMessages[prevMessages.length - 1];
              if (lastMessage.type === 'bot') {
                return [
                  ...prevMessages.slice(0, -1),
                  {
                    ...lastMessage,
                    status: 'completed',
                    isPlaying: lastMessage.isPlaying,
                    ttsStreamingId: lastMessage.ttsStreamingId
                  }
                ];
              }
              return prevMessages;
            });
            setIsResponding(false);
            currentLLMRequestRef.current = null;
          },
          image,
          recentMessages,
          apiKey?.[0],
          'VLM'
        );
      }
    } catch (error) {
      console.error('Failed to get LLM response:', error);
      setIsResponding(false);
      currentLLMRequestRef.current = null;
    }
  };

  const handleStopResponse = () => {
    if (currentLLMRequestRef.current) {
      currentLLMRequestRef.current.abort();
      setMessages(prevMessages => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage.type === 'bot' && lastMessage.status === 'searching') {
          return [
            ...prevMessages.slice(0, -1),
            {
              ...lastMessage,
              status: 'completed'
            }
          ];
        }
        return prevMessages;
      });
      setIsResponding(false);
      currentLLMRequestRef.current = null;
    }
  };

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx, my], down }) => {
        if (down) {
          setIsCancelling(my < -20);
        }
      },
      onDragStart: async () => {
        console.log('Drag Start');
        if (isResponding) {
          handleStopResponse();
        }
        await stopAllTTS();
        
        setIsRecording(true);
        currentASRTextRef.current = '';
        
        try {
          await startASR({
            vadEnable: true,
            vadEndWaitMs: 1000,
            maxWaitMs: 60000
          });
        } catch (error) {
          console.error('Failed to start ASR:', error);
          setIsRecording(false);
        }
      },
      onDragEnd: async () => {
        console.log('Drag End ' + currentASRTextRef.current);
        setIsRecording(false);
        setIsCancelling(false);

        // 延迟一段时间，以确保 ASR 结果已经被更新
        setTimeout(async () => {
          try {
            await stopASR({});
            
            if (!isCancelling && currentASRTextRef.current.trim()) {
              const newMessage: Message = {
                id: Date.now(),
                type: 'user',
                content: currentASRTextRef.current.trim()
              };
              
              setMessages(prev => [...prev, newMessage]);

              await handleUserMessage(currentASRTextRef.current.trim(), undefined, false);
            }
          } catch (error) {
            console.error('Failed to stop ASR:', error);
          } finally {
            currentASRTextRef.current = '';
          }
        }, 600);
      },
    },
    {
      drag: {
        from: () => [0, 0],
        filterTaps: true,
        threshold: 0,
        pointer: {
          touch: true,
        },
        eventOptions: {
          passive: true,
        },
      },
    }
  );

  const createTTSStream = async (content: string): Promise<string> => {
    const { streamingId } = await createStreamingTTS({});
    return streamingId;
  };

  const handleTTS = async (message: Message) => {
    if (message.isPlaying) {
      if (message.ttsStreamingId) {
        await cancelStreamingTTS({ streamingId: message.ttsStreamingId });
        // 手动取消播放时，需要立即清除状态
        setMessages(prev => prev.map(msg => 
          msg.id === message.id ? { ...msg, isPlaying: false, ttsStreamingId: undefined } : msg
        ));
      }
    } else {
      try {
        const streamingId = await createTTSStream(message.content);
        setMessages(prev => prev.map(msg => 
          msg.id === message.id ? { ...msg, isPlaying: true, ttsStreamingId: streamingId } : msg
        ));
        
        await appendStreamingTTS({
          streamingId,
          newText: message.content,
          isFinish: true
        });

      } catch (error) {
        console.error('TTS error:', error);
        setMessages(prev => prev.map(msg => 
          msg.id === message.id ? { ...msg, isPlaying: false, ttsStreamingId: undefined } : msg
        ));
      }
    }
  };

  const handleCopy = async (content: string) => {
    copyMessage({ message: content });
  };

  const handleLike = async () => {
    likeMessage({ like: true });
  };

  const handleDislike = async () => {
    likeMessage({ dislike: true });
  };

  const renderMessage = (message: Message, index: number) => {
    if (message.type === 'user') {
      return (
        <div className="flex justify-end mb-4">
          <div className="max-w-[80%] bg-[#EFEFFD] text-black rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl px-4 py-2">
            <p className="text-left">{message.content}</p>
            {message.image && (
              <img
                src={message.image}
                className="rounded-lg mb-2 max-w-full max-h-[240px] object-contain"
              />
            )}
          </div>
        </div>
      );
    }
    // 判断是否为最后一条 bot 消息
    const isLastBotMessage = messages
      .slice(index + 1)
      .every(msg => msg.type === 'user');

    return (
      <div className="flex justify-start">
        <div className="max-w-full w-full py-2">
          <div className="prose prose-p:my-1 prose-ul:my-1 prose-li:my-0 max-w-none">
            {!isAIAssistMode && (message.status === 'searching' ? (
              <div className="flex items-center text-[#737A87] text-[13px] leading-none mb-2">
                <SearchIcon className="mr-1" />
                <span>正在生成中...</span>
              </div>
            ) : (message.status === 'completed' && isLastBotMessage) && (
              <div className="flex items-center text-[#737A87] text-[13px] leading-none mb-2">
                <CheckIcon className="mr-1" />
                <span>生成完毕</span>
              </div>
            ))}
            {/* 添加思考过程区块 */}
            {message.reasoningContent != null && (
              <ReasoningBlock 
                content={message.reasoningContent}
                thinkingTime={message.thinkingTime}
                status={message.status}
              />
            )}

            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="my-1">{children}</p>,
                ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                li: ({ children }) => <li className="my-0">{children}</li>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          {message.status === 'completed' && isLastBotMessage && (
            <>
              <div className="h-[0.5px] bg-[rgba(0,0,0,0.1)] my-3" />
              <div className="flex items-center justify-between text-gray-500">
                {/* 左侧按钮组 */}
                <div className="flex items-center space-x-4">
                  <button 
                    className="p-1 rounded"
                    onClick={() => handleTTS(message)}
                  >
                    {message.isPlaying ? (
                      <WaveIcon />
                    ) : (
                      <VolumeIcon />
                    )}
                  </button>
                  <button className="p-1 rounded"
                    onClick={() => handleCopy(message.content)}>
                    <CopyIcon />
                  </button>
                </div>

                {/* 右侧按钮组 */}
                <div className="flex items-center space-x-4">
                  <button className="p-1 rounded"
                    onClick={() => handleLike()}>
                    <LikeIcon />
                  </button>
                  <button className="p-1 rounded"
                    onClick={() => handleDislike()}>
                    <DislikeIcon />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderWaveform = () => {
    return (
      <div className="flex items-center justify-center space-x-[2px] h-6 w-80">
        {Array.from({ length: 60 }).map((_, index) => {
          const centerIndex = 29; // 中心点索引 (60/2 - 1)
          const distanceFromCenter = Math.abs(index - centerIndex);
          const delayTime = distanceFromCenter * 0.03; // 距离越远延迟越大
          
          // 根据距离计算最大高度
          const maxHeight = Math.max(10, 20 - (distanceFromCenter * 0.3)); // 从20逐渐降到10

          return (
            <motion.div
              key={index}
              className="w-[2px] bg-white"
              initial={{ height: "6px" }}
              animate={{ 
                height: ["6px", `${Math.random() * (maxHeight - 6) + 6}px`, "6px"],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: delayTime,
              }}
            />
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    onTTSFinished(({ streamingId }) => {
      console.log('onTTSFinished streamingId=' + streamingId);
      setMessages(prev => prev.map(msg =>
        msg.ttsStreamingId === streamingId ? { ...msg, isPlaying: false, ttsStreamingId: undefined } : msg
      ));
    });
  }, []);

  useEffect(() => {
    onASRResult(({ text, isFinished }) => {
      console.log('onASRResult text=' + text + ' isFinished=' + isFinished);
      currentASRTextRef.current = text;
    });

    if (initialMessages.length > 0) {
      const userMessage = initialMessages[0];
      handleUserMessage(userMessage.content, userMessage.image, true);
    }
  }, [initialMessages]);

  const checkShouldAutoScroll = () => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    const lastMessage = messageList.lastElementChild;
    if (!lastMessage) return;

    const containerHeight = messageList.clientHeight;
    const scrollTop = messageList.scrollTop;
    const scrollHeight = messageList.scrollHeight;
    
    console.log(`checkShouldAutoScroll scrollHeight=${scrollHeight} scrollTop + containerHeight=${scrollTop + containerHeight}`)
    setShouldAutoScroll(scrollHeight - (scrollTop + containerHeight) < 100);
  };

  const handleScroll = () => {
    if (userScrolling) return;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      checkShouldAutoScroll();
      console.log('handleScroll shouldAutoScroll=' + shouldAutoScroll);
    }, 100);
  };

  const handleTouchStart = () => {
    setUserScrolling(true);
  };

  const handleTouchEnd = () => {
    setUserScrolling(false);
    checkShouldAutoScroll();
    console.log('handleTouchEnd shouldAutoScroll=' + shouldAutoScroll);
  };

  const scrollToBottom = () => {
    if (!shouldAutoScroll || userScrolling) {
      console.log('scrollToBottom return shouldAutoScroll=' + shouldAutoScroll + ' userScrolling=' + userScrolling);
      return;
    }

    const messageList = messageListRef.current;
    if (!messageList) return;

    console.log('scrollToBottom scrollHeight=' + messageList.scrollHeight);
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: 'auto' // 改为即时滚动，避免平滑滚动导致的闪烁
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, shouldAutoScroll, userScrolling]);

  return (
    <div className="h-full flex flex-col bg-white relative">
      <div
        ref={messageListRef}
        className="flex-1 px-4 pt-4 pb-32 bg-white overflow-y-auto"
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex flex-col bg-white">
          {messages.map((message, index) => renderMessage(message, index))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 pb-8 bg-white">
        <div className="h-5 mb-4 text-center text-sm text-gray-500">
          {isRecording ? (
            isCancelling ? '松手取消' : '松手发送，上移取消'
          ) : (
            <div className="flex items-center justify-center space-x-1">
              <span>由</span>
              <img
                src={ASRLogo}
                alt="火山方舟"
                className="w-[53px] inline-block"
              />
              <span>提供AI技术支持</span>
            </div>
          )}
        </div>
        <div className="relative flex items-center justify-center space-x-3">
          <div 
            {...bind()}
            className={`
              flex-1 h-12 rounded-xl shadow-[0_4px_14px_0_rgba(0,0,0,0.15)] 
              flex items-center justify-center touch-none select-none
              ${isRecording 
                ? isCancelling
                  ? 'bg-[#D7312A] text-white' // 当 isCancelling 为 true 时使用红色背景
                  : 'bg-[#5A3AFF] text-white'  // 正常录音状态使用紫色背景
                : 'bg-white text-gray-600'     // 未录音状态使用白色背景
              }
            `}
          >
            {isRecording ? (
              renderWaveform()
            ) : (
              <div className="h-6 flex items-center pointer-events-none text-base font-semibold text-black">按住说话</div>
            )}
          </div>

          {isResponding && (
            <button
              onClick={handleStopResponse}
              className="shrink-0 w-12 h-12 rounded-full bg-white shadow-[0_4px_14px_0_rgba(0,0,0,0.15)] flex items-center justify-center"
            >
              <motion.div 
                className="w-4 h-4 rounded-[5px] bg-gradient-to-r from-[#5E6EFF] via-[#735EFF] to-[#3870FF]"
                animate={{ 
                  opacity: [0.6, 1, 0.6] 
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
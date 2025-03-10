import { CAMER_MODE } from '@/types';
import { MdBox } from '@flow-web/md-box';
import { startASR, onASRResult, stopASR } from '@ai-app/multimodal-api';
import styles from './index.module.less';
import React, { useEffect, useRef, useState } from 'react';
import { EQUESTIONSTATUS, IMessage } from '@/pages/entry/routes/recognition-result/components/AnswerCard';
import { LLMApi } from '@/api/llm';
import { genId } from '@/pages/entry/utils';
import { Toast } from 'antd-mobile';
import { motion } from 'framer-motion';

interface IProps {
  onAsrSend?: (text?: string) => void;
  onLLMAbort: () => void;
  hidden?: boolean;
  idx?: number;
  initMessage: {
    role: 'user' | 'assistant';
    vlmContent?: string;
    reasoning?: string;
    reasoningStartTime?: number;
    reasoningEndTime?: number;
    isCollapsed?: boolean;
    state: EQUESTIONSTATUS;
    deepseekContent?: string;
    userContent?: string;
  };
}

// 单个题目的对话区域
export const ChatBlock = (props: IProps) => {
  const { initMessage, idx, onLLMAbort, hidden, onAsrSend } = props;
  const [messageList, setMessageList] = useState<IMessage[]>([initMessage]);
  // 大模型是否正在输出
  const [isLLMOutputing, setIsLLMOutputing] = useState(false);
  const [isMessageInited, setIsMessageInited] = useState(false);

  const [isRecording, setIsRecording] = useState(false);

  const [isCanceling, setIsCanceling] = useState(false);
  const [startY = 0, setStartY] = useState<number>();
  const asrText = useRef('');
  const [like, setLike] = useState<boolean | undefined>();
  const chatAbortController = React.useRef<any>();
  const messageListRef = useRef<IMessage[]>([]);
  useEffect(() => {
    // init message 正常输出结束，此时指定init message
    if (initMessage.state !== EQUESTIONSTATUS.CORRECTING && !isMessageInited) {
      setMessageList([initMessage]);
      setIsMessageInited(true);
      messageListRef.current = [initMessage];
    }
  }, [initMessage, isMessageInited]);
  useEffect(() => {
    setIsLLMOutputing(initMessage.state === EQUESTIONSTATUS.CORRECTING);
  }, [initMessage.state]);
  useEffect(() => {
    onASRResult(({ text, isFinished }) => {
      asrText.current = text;
      if (isFinished) {
      }
    });
  }, []);
  const updateMessageCollapse = (isCollapsed: boolean, index: number) => {
    const newMsg = messageListRef.current.map((msg, id) =>
      id === index
        ? {
            ...msg,
            isCollapsed
          }
        : msg
    );
    messageListRef.current = newMsg;
    setMessageList([...messageListRef.current]);
  };
  const renderWaveform = () => (
    <div className="flex items-center justify-center space-x-[2px] h-6 w-80">
      {Array.from({ length: 60 }).map((_, index) => {
        const centerIndex = 29; // 中心点索引 (60/2 - 1)
        const distanceFromCenter = Math.abs(index - centerIndex);
        const delayTime = distanceFromCenter * 0.03; // 距离越远延迟越大

        // 根据距离计算最大高度
        const maxHeight = Math.max(10, 20 - distanceFromCenter * 0.3); // 从20逐渐降到10

        return (
          <motion.div
            key={index}
            className="w-[2px] bg-white"
            initial={{ height: '6px' }}
            animate={{
              height: ['6px', `${Math.random() * (maxHeight - 6) + 6}px`, '6px']
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: delayTime
            }}
          />
        );
      })}
    </div>
  );
  const updateMessage = ({
    reasoning = '',
    deepseekContent = '',
    userContent = '',
    role
  }: {
    reasoning?: string;
    deepseekContent?: string;
    userContent?: string;
    role: 'user' | 'assistant';
  }) => {
    setMessageList((messages) => {
      const lastMessage = messageListRef.current[messageListRef.current.length - 1];
      // 用户asr的消息，直接发送给大模型
      if (role === 'user') {
        const newMessage = {
          role: 'user' as const,
          userContent
        };
        const msgList = [...messageListRef.current, newMessage];
        messageListRef.current = msgList;
        return msgList;
      } else {
        const isLastedUser = lastMessage.role === 'user';
        // 大模型输出的消息，直接更新
        if (deepseekContent && !lastMessage.reasoningEndTime) {
          updateMessageCollapse(true, messageListRef.current.length - 1);
        }
        const newMessage = {
          role: 'assistant' as const,
          reasoning: (lastMessage.reasoning || '') + reasoning,
          deepseekContent: (lastMessage.deepseekContent || '') + deepseekContent,
          reasoningStartTime:
            reasoning && !lastMessage.reasoningStartTime ? Date.now() : lastMessage.reasoningStartTime,
          reasoningEndTime:
            deepseekContent && !lastMessage.reasoningEndTime ? Date.now() : lastMessage.reasoningEndTime,
          isCollapsed: (deepseekContent && !lastMessage.reasoningEndTime) || Boolean(lastMessage.isCollapsed)
        };
        if (isLastedUser) {
          const msgList = [...messageListRef.current, newMessage];
          messageListRef.current = msgList;
          return msgList;
        } else {
          const msgList = [...messageListRef.current.slice(0, messageListRef.current.length - 1), newMessage];
          messageListRef.current = msgList;
          return msgList;
        }
      }
    });
  };
  const handleStartASR = async () => {
    //
    try {
      setIsRecording(true);
      await startASR({
        vadEnable: true,
        vadEndWaitMs: 1000,
        maxWaitMs: 60000
      });
    } catch {
      setIsRecording(false);
    } finally {
    }
  };
  const handleEndASR = () => {
    stopASR();
    // 取消asr发送
    if (isCanceling) {
      // asrText.current = '';
      // setIsCanceling(false);
      return;
    }

    // 更新用户asr消息
    if (!asrText.current) {
      Toast.show({
        content: '说话时间太短，请重新录入'
      });
      return;
    }
    // asr发送，中断LLM
    chatAbortController.current && chatAbortController.current();
    onLLMAbort();
    if (!isMessageInited) {
      setMessageList([initMessage]);
      messageListRef.current = [initMessage];
      setIsMessageInited(true);
    }
    setIsLLMOutputing(false);
    updateMessage({
      userContent: asrText.current,
      role: 'user'
    });

    const msgList = [
      ...messageListRef.current.map((msg) => ({
        role: msg.role,
        content:
          msg.role === 'user'
            ? `${msg.userContent}`
            : `${msg.vlmContent || ''} ${msg.reasoning || ''} ${msg.deepseekContent || ''}`
      })),
      ...[
        {
          role: 'user' as const,
          content: asrText.current
        }
      ]
    ];
    asrText.current = '';
    LLMApi.Chat(msgList).then(({ cb, handle }) => {
      chatAbortController.current = handle.abort.bind(handle);
      setIsLLMOutputing(true);
      cb(
        (text) => {
          //
          updateMessage({
            role: 'assistant',
            reasoning: text
          });
        },
        (text) => {
          //
          updateMessage({
            role: 'assistant',
            deepseekContent: text
          });
        },
        () => {
          setIsLLMOutputing(false);
        }
      );
    });
  };
  return (
    <div className={`w-full shrink-0 ${hidden ? '!hidden' : 'block'} `}>
      {(isMessageInited ? messageList : [initMessage])?.map(
        (
          {
            role,
            vlmContent,
            reasoning,
            reasoningStartTime = 0,
            reasoningEndTime = 0,
            isCollapsed,
            userContent,
            deepseekContent
          },
          index
        ) => (
          <>
            {role === 'user' && (
              <div className="flex justify-end mt-[24px]">
                <div className={` ${styles.userContent} py-[12px] font-normal`}>{userContent}</div>
              </div>
            )}
            {role === 'assistant' && (
              <>
                {vlmContent && (
                  <>
                    <div className="pt-2 pb-2 text-lg font-semibold">识别题目</div>
                    <MdBox
                      style={{ width: '100%', fontSize: '16px', lineHeight: '25px' }}
                      markDown={vlmContent}
                    />
                  </>
                )}

                {reasoning && (
                  <>
                    <div className="pt-[24px] pb-3 text-lg font-semibold">AI解析</div>
                    <div className={styles.reasoningCard}>
                      <div
                        onClick={() => {
                          updateMessageCollapse(!isCollapsed, index);
                        }}
                        className={`text-sm text-black  ${isCollapsed ? '' : 'mb-3'} `}
                      >
                        <div>
                          {!reasoningEndTime ? (
                            <div className={'flex gap-2'}>
                              <svg
                                width="14"
                                height="23"
                                viewBox="0 0 14 23"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M6.58138 0C6.23283 0 5.93634 0.244422 5.90163 0.568386C5.8944 0.627683 5.88861 0.68553 5.88283 0.744827C5.64709 3.07332 5.51836 5.40615 5.63551 7.74332C5.69481 8.90901 6.09687 20.3707 6.15183 21.9746C6.15906 22.206 6.34997 22.3882 6.58138 22.3882C6.81133 22.3882 6.99935 22.2045 7.00658 21.9746C7.06877 20.1668 7.46938 8.91045 7.52868 7.74332C7.64727 5.40615 7.51711 3.07332 7.28136 0.744827C7.27558 0.68553 7.26835 0.627683 7.26256 0.568386C7.22641 0.245869 6.93137 0 6.58282 0H6.58138Z"
                                  fill="url(#paint0_linear_276_124192)"
                                />
                                <path
                                  d="M1.56154 11.9541C1.50369 11.5318 1.46464 11.1225 1.36051 10.7248C1.29832 10.4861 1.06837 10.3155 0.803701 10.3155C0.539034 10.3155 0.310528 10.4847 0.246892 10.7248C0.142761 11.1225 0.103709 11.5318 0.0458587 11.9541C-0.0698427 12.7163 0.0617701 13.4712 0.129745 14.2247C0.178918 14.7917 0.300402 16.1034 0.371269 16.6675C0.384285 16.7673 0.397304 16.8685 0.410321 16.9683C0.42623 17.1722 0.593991 17.3342 0.802254 17.3342C1.01052 17.3342 1.17829 17.1722 1.1942 16.9683C1.20721 16.8685 1.22023 16.7673 1.23325 16.6675C1.30411 16.1034 1.4256 14.7917 1.47477 14.2247C1.54419 13.4712 1.67581 12.7163 1.55866 11.9541H1.56154Z"
                                  fill="url(#paint1_linear_276_124192)"
                                />
                                <path
                                  d="M10.2999 4.99195C10.2898 4.89505 10.2696 4.79815 10.2536 4.70125C10.2103 4.43803 9.96873 4.24423 9.68382 4.24423C9.67658 4.24423 9.6708 4.24568 9.66357 4.24568C9.65634 4.24568 9.65055 4.24423 9.64332 4.24423C9.3584 4.24423 9.11543 4.43948 9.07349 4.70125C9.05758 4.79815 9.03733 4.89505 9.02721 4.99195C8.78423 7.36239 8.73651 7.99296 8.80159 10.2491C8.8175 10.7871 9.05324 17.0524 9.22969 19.7309C9.24415 19.9464 9.42349 20.1127 9.63898 20.1127C9.64766 20.1127 9.65489 20.1112 9.66212 20.1098C9.6708 20.1098 9.67802 20.1127 9.68526 20.1127C9.90075 20.1127 10.0801 19.9464 10.0946 19.7309C10.271 17.0524 10.5082 10.7857 10.5226 10.2491C10.5877 7.99296 10.54 7.36239 10.297 4.99195H10.2999Z"
                                  fill="url(#paint2_linear_276_124192)"
                                />
                                <path
                                  d="M13.1187 11.9541C13.0608 11.5318 13.0218 11.1225 12.9176 10.7248C12.8555 10.4861 12.6255 10.3155 12.3608 10.3155C12.0962 10.3155 11.8677 10.4847 11.804 10.7248C11.6999 11.1225 11.6608 11.5318 11.603 11.9541C11.4873 12.7163 11.6189 13.4712 11.6869 14.2247C11.736 14.7917 11.8575 16.1034 11.9284 16.6675C11.9414 16.7673 11.9544 16.8685 11.9674 16.9683C11.9819 17.1722 12.1511 17.3342 12.3594 17.3342C12.5677 17.3342 12.7369 17.1722 12.7513 16.9683C12.7643 16.8685 12.7774 16.7673 12.7904 16.6675C12.8612 16.1034 12.9827 14.7917 13.0319 14.2247C13.1013 13.4712 13.2329 12.7163 13.1158 11.9541H13.1187Z"
                                  fill="url(#paint3_linear_276_124192)"
                                />
                                <path
                                  d="M4.13586 4.99195C4.12573 4.89505 4.10549 4.79815 4.08958 4.70125C4.0462 4.43803 3.80467 4.24423 3.51975 4.24423C3.51252 4.24423 3.50674 4.24568 3.4995 4.24568C3.49227 4.24568 3.48649 4.24423 3.47925 4.24423C3.19434 4.24423 2.95137 4.43948 2.90942 4.70125C2.89352 4.79815 2.87327 4.89505 2.86314 4.99195C2.62017 7.36239 2.57244 7.99296 2.63753 10.2491C2.65343 10.7871 2.88918 17.0524 3.06562 19.7309C3.08009 19.9464 3.25943 20.1127 3.47492 20.1127C3.4836 20.1127 3.49082 20.1112 3.49806 20.1098C3.50673 20.1098 3.51396 20.1127 3.52119 20.1127C3.73669 20.1127 3.91603 19.9464 3.93049 19.7309C4.10693 17.0524 4.34412 10.7857 4.35859 10.2491C4.42367 7.99296 4.37594 7.36239 4.13297 4.99195H4.13586Z"
                                  fill="url(#paint4_linear_276_124192)"
                                />
                                <defs>
                                  <linearGradient
                                    id="paint0_linear_276_124192"
                                    x1="6.58137"
                                    y1="25.4239"
                                    x2="6.58137"
                                    y2="0.739042"
                                    gradientUnits="userSpaceOnUse"
                                  >
                                    <stop offset="0.12" stopColor="#CB63FF" />
                                    <stop offset="0.24" stopColor="#936CFF" />
                                    <stop offset="0.38" stopColor="#5476FF" />
                                    <stop offset="0.5" stopColor="#267DFF" />
                                    <stop offset="0.6" stopColor="#0A82FF" />
                                    <stop offset="0.65" stopColor="#0084FF" />
                                    <stop offset="0.96" stopColor="#25DFF7" />
                                  </linearGradient>
                                  <linearGradient
                                    id="paint1_linear_276_124192"
                                    x1="0.803704"
                                    y1="25.4246"
                                    x2="0.803704"
                                    y2="0.739727"
                                    gradientUnits="userSpaceOnUse"
                                  >
                                    <stop offset="0.12" stopColor="#CB63FF" />
                                    <stop offset="0.24" stopColor="#936CFF" />
                                    <stop offset="0.38" stopColor="#5476FF" />
                                    <stop offset="0.5" stopColor="#267DFF" />
                                    <stop offset="0.6" stopColor="#0A82FF" />
                                    <stop offset="0.65" stopColor="#0084FF" />
                                    <stop offset="0.96" stopColor="#25DFF7" />
                                  </linearGradient>
                                  <linearGradient
                                    id="paint2_linear_276_124192"
                                    x1="9.66356"
                                    y1="25.4234"
                                    x2="9.66356"
                                    y2="0.73848"
                                    gradientUnits="userSpaceOnUse"
                                  >
                                    <stop offset="0.12" stopColor="#CB63FF" />
                                    <stop offset="0.24" stopColor="#936CFF" />
                                    <stop offset="0.38" stopColor="#5476FF" />
                                    <stop offset="0.5" stopColor="#267DFF" />
                                    <stop offset="0.6" stopColor="#0A82FF" />
                                    <stop offset="0.65" stopColor="#0084FF" />
                                    <stop offset="0.96" stopColor="#25DFF7" />
                                  </linearGradient>
                                  <linearGradient
                                    id="paint3_linear_276_124192"
                                    x1="12.3608"
                                    y1="25.4246"
                                    x2="12.3608"
                                    y2="0.739727"
                                    gradientUnits="userSpaceOnUse"
                                  >
                                    <stop offset="0.12" stopColor="#CB63FF" />
                                    <stop offset="0.24" stopColor="#936CFF" />
                                    <stop offset="0.38" stopColor="#5476FF" />
                                    <stop offset="0.5" stopColor="#267DFF" />
                                    <stop offset="0.6" stopColor="#0A82FF" />
                                    <stop offset="0.65" stopColor="#0084FF" />
                                    <stop offset="0.96" stopColor="#25DFF7" />
                                  </linearGradient>
                                  <linearGradient
                                    id="paint4_linear_276_124192"
                                    x1="3.4995"
                                    y1="25.4234"
                                    x2="3.4995"
                                    y2="0.73848"
                                    gradientUnits="userSpaceOnUse"
                                  >
                                    <stop offset="0.12" stopColor="#CB63FF" />
                                    <stop offset="0.24" stopColor="#936CFF" />
                                    <stop offset="0.38" stopColor="#5476FF" />
                                    <stop offset="0.5" stopColor="#267DFF" />
                                    <stop offset="0.6" stopColor="#0A82FF" />
                                    <stop offset="0.65" stopColor="#0084FF" />
                                    <stop offset="0.96" stopColor="#25DFF7" />
                                  </linearGradient>
                                </defs>
                              </svg>
                              <span className={styles.thinking}>思考中...</span>
                            </div>
                          ) : (
                            <div className={'flex gap-2'}>
                              <svg
                                className={'relative top-[6px]'}
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                              >
                                <path
                                  d="M0.506348 5.9981C0.506348 9.0311 2.9646 11.4896 5.9981 11.4896C9.0311 11.4896 11.4896 9.0311 11.4896 5.9981C11.4896 2.96485 9.0311 0.506348 5.9981 0.506348C2.96485 0.506348 0.506848 2.96485 0.506348 5.9981ZM8.2591 4.25211L8.81485 4.80811C8.8372 4.83045 8.85494 4.85697 8.86703 4.88616C8.87913 4.91535 8.88536 4.94664 8.88536 4.97824C8.88536 5.00984 8.87913 5.04113 8.86703 5.07032C8.85494 5.09951 8.8372 5.12603 8.81485 5.14836L5.57085 8.39261C5.54852 8.41497 5.522 8.4327 5.49281 8.4448C5.46361 8.45689 5.43233 8.46312 5.40073 8.46312C5.36913 8.46312 5.33784 8.45689 5.30865 8.4448C5.27946 8.4327 5.25294 8.41497 5.2306 8.39261L3.1811 6.34311C3.15875 6.32078 3.14102 6.29426 3.12892 6.26507C3.11682 6.23588 3.1106 6.20459 3.1106 6.17299C3.1106 6.14139 3.11682 6.1101 3.12892 6.08091C3.14102 6.05172 3.15875 6.0252 3.1811 6.00286L3.73685 5.44736C3.75919 5.42497 3.78573 5.40721 3.81494 5.39509C3.84416 5.38297 3.87547 5.37673 3.9071 5.37673C3.93873 5.37673 3.97005 5.38297 3.99926 5.39509C4.02848 5.40721 4.05501 5.42497 4.07735 5.44736L5.4006 6.76986L7.9191 4.25211C7.9642 4.20705 8.02535 4.18173 8.0891 4.18173C8.15286 4.18173 8.214 4.20705 8.2591 4.25211Z"
                                  fill="#10C374"
                                />
                              </svg>
                              <span className={styles.thinkText}>
                                已深度思考 (耗时{Math.floor((reasoningEndTime - reasoningStartTime) / 1000)}s)
                              </span>
                              {isCollapsed ? (
                                <svg
                                  className={'relative top-[6px]'}
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                >
                                  <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M3.46129 3.67509C3.22783 3.44164 2.84933 3.44164 2.61587 3.67509L2.19316 4.0978C1.9597 4.33126 1.9597 4.70977 2.19316 4.94322L5.57484 8.32491C5.6922 8.44226 5.8462 8.50062 6.00001 8.49999C6.15382 8.50062 6.30782 8.44226 6.42518 8.32491L9.80686 4.94322C10.0403 4.70977 10.0403 4.33126 9.80686 4.0978L9.38415 3.67509C9.15069 3.44164 8.77219 3.44164 8.53873 3.67509L6.00001 6.21381L3.46129 3.67509Z"
                                    fill="#737A87"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  className={'relative top-[6px]'}
                                  height="12"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                >
                                  <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M8.53871 8.32491C8.77217 8.55836 9.15067 8.55836 9.38413 8.32491L9.80684 7.9022C10.0403 7.66874 10.0403 7.29023 9.80684 7.05678L6.42516 3.67509C6.3078 3.55774 6.1538 3.49938 5.99999 3.5C5.84618 3.49938 5.69218 3.55774 5.57482 3.67509L2.19314 7.05678C1.95968 7.29023 1.95968 7.66874 2.19314 7.9022L2.61585 8.32491C2.84931 8.55836 3.22781 8.55836 3.46127 8.32491L5.99999 5.78619L8.53871 8.32491Z"
                                    fill="#737A87"
                                  />
                                </svg>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {!isCollapsed && (
                        <MdBox
                          className={styles.reasoningCardLine}
                          style={{ width: '100%', fontSize: '13px' }}
                          markDown={reasoning}
                        />
                      )}
                    </div>
                  </>
                )}
                {deepseekContent && (
                  <>
                    <div className="py-[18px] text-lg font-semibold">答案解析</div>
                    <MdBox
                      style={{ width: '100%', fontSize: '16px', lineHeight: '25px' }}
                      markDown={deepseekContent}
                    />
                  </>
                )}
                {!isLLMOutputing && (vlmContent || reasoning) && index === 0 && (
                  <div className="flex text-base mt-[10px] justify-between flex-nowrap gap-2">
                    <div
                      className={`flex w-[48%] whitespace-nowrap h-[39px] items-center justify-center py-2 px-[56px] rounded-lg gap-2 ${
                        like === true ? 'bg-[#EBF1FF]' : 'bg-[#F6F8FA]'
                      }`}
                      onTouchStart={() => {
                        setLike(true);
                        Toast.show({
                          content: '感谢您的喜欢',
                          duration: 1000,
                          maskClassName: styles.feedbackTip
                        });
                      }}
                    >
                      <span>😄</span>
                      <span>满意</span>
                    </div>
                    <div
                      onTouchStart={() => {
                        setLike(false);
                        Toast.show({
                          content: '感谢您的反馈，我们会改进的',
                          duration: 1000,
                          maskClassName: styles.feedbackTip
                        });
                      }}
                      className={`flex w-[48%] whitespace-nowrap h-[39px]  items-center justify-center py-2 px-[56px] rounded-lg gap-2 ${
                        like === false ? 'bg-[#EBF1FF]' : 'bg-[#F6F8FA]'
                      } `}
                    >
                      <span>☹️</span>
                      <span>不满意</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
      <div className={`${styles.asrInputWrapper} ${hidden ? '!hidden' : ''} `}>
        <div
          className={`${styles.asrInput} select-none justify-center ${
            isRecording ? `mt-[48px] ${isCanceling ? 'bg-[#D7312A]' : 'bg-[#0AB76A]'}` : ''
          } `}
          onTouchStart={(e) => {
            handleStartASR();
            setIsCanceling(false);
            e?.touches[0]?.clientY && setStartY(e.touches[0].clientY);
          }}
          onTouchMove={(e) => {
            const currentY = e.touches[0].clientY;
            const deltaY = startY - currentY;

            if (deltaY > 50) {
              setIsCanceling(true);
            } else {
              setIsCanceling(false);
            }
          }}
          onTouchEnd={() => {
            setIsRecording(false);
            setTimeout(() => {
              handleEndASR();
            }, 1000);
          }}
        >
          {isRecording ? (
            isCanceling ? (
              <div className={`${styles.asrTip} flex justify-center text-[#D7312A]`}>松手取消发送</div>
            ) : (
              <div className={`${styles.asrTip} text-[#737A87]`}>松手发送，上移取消</div>
            )
          ) : null}
          {isRecording ? (
            renderWaveform()
          ) : (
            <div className="font-semibold text-base inline-block select-none text-black">按住说话</div>
          )}
        </div>
        {isLLMOutputing && (
          <motion.div
            animate={{
              opacity: [0.6, 1, 0.6]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
            onClick={() => {
              setIsLLMOutputing(false);
              onLLMAbort();
              if (chatAbortController.current) {
                chatAbortController.current();
              }
              if (isMessageInited) {
              } else {
                // 打断，直接指定 init message
                setMessageList([initMessage]);
                messageListRef.current = [initMessage];
                setIsMessageInited(true);
              }
            }}
            className={styles.abortLlm}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="6" y="6" width="16" height="16" rx="5" fill="white" />
              <rect x="6" y="6" width="16" height="16" rx="5" fill="#12C777" />
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  );
};

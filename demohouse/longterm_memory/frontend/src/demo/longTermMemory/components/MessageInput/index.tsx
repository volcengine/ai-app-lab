/* eslint-disable react/destructuring-assignment */
/* eslint-disable max-lines-per-function */
import { FC, useCallback, useMemo, useRef, useState, useEffect, ReactNode } from 'react';

import clsx from 'classnames';
import { useClickAway } from 'ahooks';

interface Props {
  activeSendBtn: boolean;
  /**
   * 是否自动聚焦在输入框
   * @default true
   * @optional
   */
  autoFocus: boolean;

  /**
   * 默认文案
   * @required
   */
  placeholder: string;

  /**
   * 发送消息函数
   * @required
   */
  sendMessage: (message: string) => void;

  /**
   * 最大可以发送 token 数量
   * @required
   */
  maxTokens?: number;

  /**
   * 当前是否可以发送消息
   * @required
   */
  canSendMessage: boolean;

  /**
   * 禁用展开和输入
   *
   */

  expandDisabled?: boolean;

  /**
   * 当无法发送消息时候，用户依然点击之后的事件
   */
  onCanNotSendMessage?: () => void;

  /**
   * 底部区域
   */
  extra: (inputValue: string) => ReactNode;

  /**
   * textarea InputActions
   */
  actions?: ReactNode[];
}

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.016 5.4599L2.31917 7.5515C1.50523 7.6971 1.23456 8.72844 1.8722 9.255L4.94318 11.7908C5.10289 11.9226 5.30057 11.9999 5.50734 12.0113C5.71412 12.0228 5.91913 11.9678 6.09241 11.8544L10.6778 8.85372C10.9264 8.69107 11.1934 9.03206 10.9757 9.23445L6.96044 12.9643C6.80871 13.1052 6.70605 13.2909 6.66748 13.4944C6.62891 13.6978 6.65644 13.9082 6.74606 14.0949L8.46837 17.6851C8.82591 18.4304 9.8923 18.4157 10.2294 17.6609L15.0727 6.81074C15.3902 6.09939 14.7826 5.32286 14.016 5.4599Z"
      fill="#FAF9FF"
      transform="translate(2, -0.5)"
    />
  </svg>
);

const SendButton: FC<{ active: boolean; onClick: () => void }> = ({ active, onClick }) => (
  <div
    className={`w-11 h-7 rounded-[14px] flex items-center justify-center transition-[background] duration-300 ${
      active ? ' cursor-pointer' : ' cursor-not-allowed'
    }`}
    onClick={onClick}
    style={{
      background: active
        ? 'linear-gradient(149deg, #7E83FF 13.01%, #735CFF 46.75%, #3671FF 85.57%)'
        : 'linear-gradient(0deg, rgba(255, 255, 255, 0.50) 0%, rgba(255, 255, 255, 0.50) 100%), linear-gradient(149deg, #7E83FF 13.01%, #735CFF 46.75%, #3671FF 85.57%)',
    }}
  >
    <SendIcon />
  </div>
);

/**
 * 将 Placeholder 逐字显示
 * @param placeholder
 * @param typingSpeed
 */
export function useTypingPlaceholder(placeholder: string, typingSpeed = 30) {
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');

  useEffect(() => {
    // 初始化或重新开始时重置 displayedPlaceholder
    setDisplayedPlaceholder('');

    let index = 0; // 用于跟踪当前字符的索引

    const timer = window.setInterval(() => {
      if (index < placeholder.length) {
        setDisplayedPlaceholder(placeholder.slice(0, index + 1));
        index++; // 移动到下一个字符
      } else {
        window.clearInterval(timer); // 完成显示后清除计时器
      }
    }, typingSpeed);

    return () => window.clearInterval(timer); // 清理工作
  }, [placeholder, typingSpeed]); // 依赖项中包括 placeholder

  return displayedPlaceholder;
}

/**
 * 区分是否正在使用拼写输入，用来避免拼写输入时的 Enter 触发发送消息
 */
const useCompositionStatus = () => {
  const [isComposing, setIsComposing] = useState(false);

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  return { isComposing, handleCompositionStart, handleCompositionEnd };
};

/**
 * 消息输入框
 * @param props
 * @constructor
 */
export const MessageInput = (props: Props) => {
  const [message, setMessage] = useState('');
  const { isComposing, handleCompositionStart, handleCompositionEnd } = useCompositionStatus();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [triggerCanNotSendMessage, setTriggerCanNotSendMessage] = useState(false);

  /**
   * 折叠整体输入框
   * 注意只能输入框没有内容时调用，否则会导致内容展示不全
   * 此函数专注于样式处理
   */
  const toFold = useCallback(() => {
    setExpanded(false);
    // 恢复文本输入框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = '22px';
    }

    if (containerRef.current) {
      containerRef.current.style.height = '';
    }
  }, []);

  /**
   * 处理发送消息逻辑
   */
  const handleSendMessage = useCallback(() => {
    if (!props.canSendMessage) {
      props?.onCanNotSendMessage && props?.onCanNotSendMessage();
      setTriggerCanNotSendMessage(true);
      return;
    }

    props.sendMessage?.(message);
    setMessage('');
    toFold();
  }, [message, props.canSendMessage, props.sendMessage, props?.onCanNotSendMessage, toFold]);

  /**
   * 处理输入框内容变化
   * 当内容开始输入时，需要处理 UI 变化：
   * 1. 输入框需要跟随内容变高
   * 2. 整体对话框高度需要进行实时计算，虽然计算结果和真实高度其实是一样的，但是，如果不进行计算，就无法得到实际高度
   * 缺少实际高度，就无法进行动画过渡
   * @param e
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;

    // if (newMessage.length > props?.maxTokens) {
    //   setTriggerMaxTokens(true);
    //   newMessage = newMessage.slice(0, props?.maxTokens);
    // }

    setMessage(newMessage);

    // 浏览器为了减少重绘，默认情况不会更新 scrollHeight，这导致内容缩减也无法减少 scrollHeight
    // 会将高度设置为 auto，然后再设置为真实高度，就能得到真实高度
    e.target.style.height = 'auto';
    const textareaHeight = e.target.scrollHeight;
    const realTextAreaHeight = textareaHeight > 88 ? 88 : textareaHeight;
    e.target.style.height = `${realTextAreaHeight}px`;
    // 只有在大于 88 px 的时候，再出现滚动条
    if (realTextAreaHeight >= 88) {
      e.target.style.overflowY = 'scroll';
    } else {
      e.target.style.overflowY = 'hidden';
    }

    const container = containerRef.current;

    if (container) {
      // token 高度
      const tokensHeight = 36 + 12;
      // 容器上下边距
      const padding =
        Number(getComputedStyle(container).paddingTop.replace('px', '')) +
        Number(getComputedStyle(container).paddingBottom.replace('px', ''));

      // 外部容器的最新高度，实际和原本高度一样，但是这样可以触发动画过渡
      const newHeight = realTextAreaHeight + padding + tokensHeight;
      container.style.height = `${newHeight}px`;
    }
  };

  /**
   * 最终判断是否发送消息的逻辑
   * 通过区分是否正在输入中，避免拼写输入时的 Enter 触发发送消息
   * @param e
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposing) {
        return;
      }

      // 必须是只按下 Enter 才会发送，按住 any + enter / cmd + enter 等等其他无需处理
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        handleSendMessage();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [isComposing, handleSendMessage],
  );

  /**
   * 是否可以发送消息，需要满足两个条件：
   * 1. 文本有内容
   * 2. 外部传入的 canSendMessage 为 true
   */
  const activeSendButton = useMemo(
    () => props.activeSendBtn || (props.canSendMessage && message.length > 0),
    [props.canSendMessage, message, props.activeSendBtn],
  );

  /**
   * 处理输入框聚焦
   * @param _
   */
  const handleFocus = useCallback(() => {
    if (props?.expandDisabled) {
      return;
    }
    setExpanded(true);
  }, []);

  /**
   * 处理输入框失焦，只有在没有文本时，才会折叠
   * @param _
   */
  const handleBlur = useCallback(() => {
    if (message.length === 0) {
      toFold();
    }
  }, [message]);

  useEffect(() => {
    if (props?.expandDisabled) {
      return;
    }
    if (props?.autoFocus) {
      textareaRef.current?.focus();
      setExpanded(true);
    }
  }, [props.autoFocus, props?.expandDisabled]);

  useClickAway(() => {
    handleBlur();
  }, containerRef.current);

  return (
    <div
      onClick={() => handleFocus()}
      id="message-input"
      className={clsx(
        'w-full  relative self-stretch box-border px-4 pt-[10px] pb-[10px] bg-white rounded-lg border  flex-col justify-start items-start gap-2 flex transition-all duration-300 overflow-y-hidden',
        expanded ? ' border-[#6C54FF]' : ' border-[#BDB8E5]',
        props?.expandDisabled && 'bg-[#FCFDFE]',
        expanded ? 'h-[84px]' : 'h-[50px] ',
      )}
      ref={containerRef}
    >
      <div className=" self-stretch justify-start items-center gap-0.5 inline-flex">
        <textarea
          style={{
            scrollbarWidth: 'none',
          }}
          rows={1}
          className={clsx(
            'focus:ring-0 focus-visible:ring-0 w-full text-[#0C0D0E] leading-[22px] p-0 border-0 text-[13px] overflow-hidden tracking-tight focus:outline-none resize-none max-h-[88px]h-[22px] mt-[3px] mb-[3px]',
            props?.expandDisabled && 'bg-[#FCFDFE]',
          )}
          placeholder={props.placeholder}
          value={message}
          disabled={props?.expandDisabled}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          ref={textareaRef}
        />
      </div>
      {expanded ? (
        <div className="animate-fade-in pt-4 self-stretch justify-between items-end inline-flex absolute bottom-[12px] left-[16px]">
          {props.extra(message)}
        </div>
      ) : null}
      <div className="absolute bottom-[11px] right-[60px] flex items-center ">
        {props?.actions?.map(action => action)}
      </div>
      <div
        className={`w-11 h-7 bottom-[10px] right-[16px] absolute rounded-[14px] transition-all duration-300${
          triggerCanNotSendMessage ? ' animate-shake' : ''
        }`}
        onAnimationEnd={() => setTriggerCanNotSendMessage(false)}
      >
        <SendButton active={activeSendButton} onClick={handleSendMessage} />
      </div>
    </div>
  );
};

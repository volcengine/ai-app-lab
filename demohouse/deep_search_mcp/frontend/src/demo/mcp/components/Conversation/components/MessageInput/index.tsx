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

/* eslint-disable react/destructuring-assignment */
/* eslint-disable max-lines-per-function */
import {
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Divider } from '@arco-design/web-react';
import { useClickAway } from 'ahooks';
import clsx from 'classnames';

import { ReactComponent as IconSend } from '@/demo/mcp/assets/icon_chat_send.svg';
import { ReactComponent as IconStop } from '@/demo/mcp/assets/icon_chat_stop.svg';
import { useInput } from '@/demo/mcp/store/InputStore';

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

  /**
   * 一直保持展开状态
   */
  isExpandAlways?: boolean;
  // 正在对话中
  isChatting?: boolean;
  // 暂停对话
  pasueMessage?: () => void;
}

const SendButton: FC<{ active: boolean; onClick: () => void }> = ({
  active,
  onClick,
}) => (
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
    <IconSend />
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
export const useCompositionStatus = () => {
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
  const { isChatting, pasueMessage } = props;
  const { keyword, setKeyword, isActive, setIsActive } = useInput();
  const { isComposing, handleCompositionStart, handleCompositionEnd } =
    useCompositionStatus();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [triggerCanNotSendMessage, setTriggerCanNotSendMessage] =
    useState(false);

  const isExpanded = props.isExpandAlways ? true : expanded;

  const preQuestionHeight = 36;

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

    props.sendMessage?.(keyword);
    setKeyword('');
    toFold();
  }, [
    keyword,
    props.canSendMessage,
    props.sendMessage,
    props?.onCanNotSendMessage,
    toFold,
  ]);

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

    setKeyword(newMessage);

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
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
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
    () => props.activeSendBtn || (props.canSendMessage && keyword.length > 0),
    [props.canSendMessage, keyword, props.activeSendBtn],
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
    textareaRef.current?.focus();
  }, [props?.expandDisabled]);

  /**
   * 处理输入框失焦，只有在没有文本时，才会折叠
   * @param _
   */
  const handleBlur = useCallback(() => {
    if (keyword.length === 0) {
      toFold();
    }
  }, [keyword]);

  useEffect(() => {
    if (props?.expandDisabled) {
      return;
    }
    if (props?.autoFocus) {
      setIsActive(true);
    }
  }, [handleFocus, props?.autoFocus, props?.expandDisabled, setIsActive]);

  useClickAway(() => {
    handleBlur();
  }, containerRef);

  useClickAway(() => {
    setIsActive(false);
  }, containerRef);

  useEffect(() => {
    if (isActive) {
      handleFocus();
    }
  }, [handleFocus, isActive]);

  return (
    <div
      onClick={() => {
        setIsActive(true);
        handleFocus();
      }}
      id="message-input"
      className={clsx(
        `w-full  relative self-stretch box-border px-4 pt-[10px] pb-[10px] bg-white rounded-lg border  flex-col justify-start items-start gap-2 flex transition-all duration-300 overflow-y-hidden hover:border-[#6C54FF]`,
        isActive && isExpanded ? ' border-[#6C54FF]' : ' border-[#EAEDF1]',
        props?.expandDisabled && 'bg-[#FCFDFE]',
        props.isExpandAlways && 'min-h-[110px]',
        isExpanded ? 'h-[110px]' : 'h-[70px] ',
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
          value={keyword}
          disabled={props?.expandDisabled}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          ref={textareaRef}
        />
      </div>
      {isExpanded && (
        <div className="animate-fade-in pt-4 self-stretch justify-between items-end inline-flex absolute bottom-[12px] left-[16px]">
          {props.extra(keyword)}
        </div>
      )}
      <div className={'absolute bottom-[11px] right-[60px] flex items-center '}>
        {props?.actions?.map(action => action)}
      </div>

      <div className={`bottom-[10px] right-[16px] absolute`}>
        {isChatting ? (
          <div
            className="w-11 h-7 rounded-[14px] flex items-center justify-center transition-[background] duration-300 cursor-pointer text-[#fff]"
            style={{
              background:
                'linear-gradient(149deg, #7E83FF 13.01%, #735CFF 46.75%, #3671FF 85.57%)',
            }}
            onClick={pasueMessage}
          >
            <IconStop className="animate-pulse" />
          </div>
        ) : (
          <SendButton active={activeSendButton} onClick={handleSendMessage} />
        )}
      </div>
    </div>
  );
};

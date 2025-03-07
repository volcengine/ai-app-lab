import React, { useEffect, useMemo, useState } from 'react';

import clsx from 'classnames';

import MessageContent from '@/demo/longTermMemory/components/MessageContent';
import { addMemory } from '@/demo/longTermMemory/api';
import { useScrollToBottom } from '@/demo/longTermMemory/hooks/useScrollToBottom';
import { useMemoryStore } from '@/demo/longTermMemory/stores/useMemoryStore';

import s from './index.module.less';
import {IconCheckCircleFill} from "@arco-design/web-react/icon";

interface Props {
  reasoningContent?: string;
  startTime?: number;
  endTime?: number;
  isReasoning: boolean;
}

const ThinkingIcon = () => (
  <div className={clsx('px-[8px] pt-[4px] text-[13px] flex flex-row justify-start items-center', s.awesomeLight)}>
    <svg className="mr-[6px]" xmlns="http://www.w3.org/2000/svg" width="18" height="14" viewBox="0 0 18 14" fill="none">
      <path
        d="M17.8064 1.48894C17.6156 1.39354 17.5352 1.57178 17.4223 1.66215C17.3855 1.69393 17.3511 1.72833 17.3194 1.76508C17.1956 1.91738 17.0383 2.039 16.8598 2.12044C16.6812 2.20187 16.4862 2.24092 16.2901 2.23452C15.9894 2.21186 15.6876 2.25719 15.4068 2.36714C15.1261 2.47709 14.8737 2.64884 14.6684 2.86964C14.631 2.61036 14.5246 2.3659 14.3603 2.16185C14.196 1.95781 13.9799 1.80169 13.7345 1.70985C13.4559 1.61613 13.2084 1.44766 13.0191 1.22284C12.9114 1.04321 12.8334 0.8474 12.7881 0.642944C12.748 0.522446 12.7078 0.39191 12.5697 0.379358C12.4317 0.366806 12.3614 0.482278 12.3011 0.585203C12.0774 1.01011 11.9684 1.486 11.9848 1.96591C11.98 2.47223 12.1039 2.97148 12.345 3.41675C12.5861 3.86202 12.9364 4.23871 13.363 4.51143C13.3861 4.52124 13.407 4.53557 13.4245 4.55359C13.442 4.5716 13.4557 4.59293 13.4648 4.61632C13.474 4.63971 13.4783 4.6647 13.4776 4.68979C13.477 4.71489 13.4713 4.7396 13.4609 4.76247C13.3981 4.97334 13.3253 5.17667 13.2626 5.38755C13.2199 5.5206 13.1597 5.55072 13.0116 5.49299C12.526 5.28345 12.0848 4.98358 11.7112 4.60933C11.0685 3.98676 10.4861 3.30143 9.76313 2.76421C9.59243 2.63869 9.42172 2.51317 9.246 2.41025C8.50795 1.69228 9.34389 1.10485 9.53719 1.03456C9.73049 0.964271 9.60749 0.710724 8.95228 0.713234C8.29707 0.715745 7.69709 0.934147 6.94398 1.21531C6.83092 1.25981 6.71415 1.29425 6.59504 1.31823C5.88247 1.18441 5.15377 1.15901 4.43361 1.24292C3.76255 1.30712 3.1134 1.51611 2.53092 1.85546C1.94844 2.19481 1.44648 2.65644 1.05967 3.20854C0.0555203 4.58172 -0.172926 6.13815 0.115767 7.76487C0.407104 9.4365 1.30003 10.9438 2.62614 12.0024C3.96333 13.1483 5.69651 13.7242 7.45359 13.6065C8.56568 13.5437 9.8033 13.3956 11.1991 12.2132C11.6202 12.3995 12.0742 12.5002 12.5346 12.5095C12.9629 12.5412 13.3935 12.5091 13.8124 12.4141C14.3646 12.2986 14.327 11.7865 14.1262 11.6936C12.512 10.9405 12.871 11.2468 12.5446 10.9982C13.3655 10.0267 14.6031 9.01754 15.0876 5.74653C15.109 5.5362 15.109 5.32424 15.0876 5.11392C15.0876 4.98589 15.1127 4.93568 15.2583 4.92313C15.6644 4.88057 16.0583 4.75951 16.4181 4.56666C17.4649 3.99429 17.8867 3.06043 17.9871 1.92825C18.0089 1.84533 18.003 1.75758 17.9704 1.6783C17.9377 1.59903 17.8802 1.53255 17.8064 1.48894ZM8.68367 11.6233C7.1172 10.3932 6.35656 9.98655 6.04276 10.0041C5.72896 10.0217 5.79172 10.3581 5.86703 10.5765C5.93234 10.774 6.02622 10.9609 6.14569 11.1313C6.17604 11.1641 6.19828 11.2036 6.21063 11.2465C6.22298 11.2895 6.22508 11.3348 6.21679 11.3787C6.20849 11.4226 6.19002 11.464 6.16285 11.4995C6.13568 11.535 6.10057 11.5637 6.06033 11.5831C5.55826 11.8944 4.67963 11.4777 4.63946 11.4576C3.60344 10.8715 2.74681 10.014 2.16173 8.97738C1.57979 7.94818 1.24705 6.79696 1.19021 5.61599C1.17514 5.3273 1.2605 5.22438 1.54668 5.17166C1.92514 5.10104 2.3125 5.09171 2.69392 5.14404C4.2518 5.36894 5.69237 6.10025 6.79336 7.22514C7.41524 7.89006 7.96864 8.61586 8.44519 9.39159C8.96127 10.2029 9.58729 10.9387 10.3054 11.5781C10.5163 11.7605 10.7394 11.9283 10.9731 12.0802C10.3731 12.153 9.369 12.1656 8.68367 11.6233ZM9.43678 6.79587C9.43678 6.73462 9.46111 6.67587 9.50443 6.63256C9.54774 6.58925 9.60648 6.56491 9.66774 6.56491C9.69525 6.56458 9.72255 6.5697 9.74807 6.57997C9.78079 6.59076 9.81018 6.60978 9.83342 6.6352C9.87477 6.67835 9.89733 6.73612 9.89618 6.79587C9.89024 6.85265 9.86347 6.90521 9.82106 6.94342C9.77864 6.98163 9.72357 7.00277 9.66648 7.00277C9.60939 7.00277 9.55432 6.98163 9.5119 6.94342C9.46949 6.90521 9.44272 6.85265 9.43678 6.79587ZM11.7689 7.9908C11.629 8.05663 11.4786 8.09741 11.3246 8.1113C11.1095 8.11787 10.8986 8.05053 10.7271 7.92051C10.6234 7.85871 10.5333 7.77661 10.4621 7.67912C10.3909 7.58163 10.3402 7.47076 10.3129 7.35317C10.2876 7.20698 10.2876 7.05753 10.3129 6.91134C10.3423 6.8132 10.341 6.70841 10.3092 6.61104C10.2773 6.51366 10.2164 6.42836 10.1347 6.36659C9.98537 6.25732 9.80203 6.20481 9.61753 6.21848C9.54992 6.21449 9.48437 6.19379 9.42674 6.15823C9.40239 6.14743 9.3806 6.13159 9.36283 6.11175C9.34505 6.09191 9.33169 6.06852 9.32362 6.04313C9.31555 6.01774 9.31296 5.99093 9.31603 5.96447C9.31909 5.93801 9.32773 5.9125 9.34138 5.88962C9.38258 5.83212 9.43064 5.77986 9.48448 5.73398C9.61851 5.66835 9.76577 5.63424 9.915 5.63424C10.0642 5.63424 10.2115 5.66835 10.3455 5.73398C10.6318 5.87979 10.8875 6.0792 11.0986 6.3214C11.2865 6.53413 11.4545 6.76353 11.6007 7.00674C11.7394 7.20287 11.8517 7.41642 11.9346 7.64186C12.0024 7.79751 11.9396 7.93055 11.7664 7.9908H11.7689Z"
        fill="#5252FF"
      />
    </svg>

    <span>DeepSeek-R1满血版 记忆抽取中...</span>
  </div>
);

export const MemoryExtraction = (props: Props) => {
  // 只有当 isReasoning 变为一次 true 后才展示
  const [uploaded, setUploaded] = useState(false);

  const { initPresetMemoryList } = useMemoryStore();
  useEffect(() => {
    initPresetMemoryList();
    // 首次进入 把预置记忆上传
    setTimeout(() => {
      addMemory();
    }, 1000);
  }, []);

  const { reasoningContent, startTime, endTime, isReasoning } = props;

  // 深度思考文本处理
  const parsedReasoningContent = useMemo(
    () => (reasoningContent ? `> ${reasoningContent}` : '').replaceAll('\n', '\n> '),
    [reasoningContent],
  );

  const [finished, setFinished] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (endTime === 0) {
      // 每次 endTime 为 0 需要重置
      setFinished(false);
      setIsExpanded(true);
    }
  }, [endTime]);

  useEffect(() => {
    const hasDuration = Boolean(startTime && endTime);
    if (hasDuration && reasoningContent && !isReasoning) {
      setFinished(true);
      setIsExpanded(false);
    }
  }, [parsedReasoningContent, isReasoning, startTime, endTime, reasoningContent]);

  const toggleContent = () => {
    setIsExpanded(!isExpanded);
  };

  //
  useEffect(() => {
    if (isReasoning) {
      setUploaded(true);
    }
  }, [isReasoning]);

  const { scrollRef, scrollDomToBottom } = useScrollToBottom(true);
  useEffect(() => {
    scrollDomToBottom();
  }, [reasoningContent]);

  return uploaded ? (
    <div className={clsx('mb-4 ', s.wrapper, finished && s.collapse)}>
      {!finished && <ThinkingIcon />}
      {finished && (
        <div
          className=" mr-[6px] px-[8px] py-[4px] text-[13px] text-[#42464E] font-medium cursor-pointer transition-all duration-300 rounded-[6px] flex flex-row justify-start items-center hover:bg-[#0000000A]"
          onClick={toggleContent}
        >
          <IconCheckCircleFill className="text-[#6233FF] mr-[6px]" />
          <div>记忆抽取完成（耗时{Math.round((Number(endTime) - Number(startTime)) / 10) / 100} 秒）</div>
          <svg
            className={clsx('text-[#737A87] w-[12px] h-[6px] transition-all duration-300', {
              'rotate-180': !isExpanded,
            })}
            width="14"
            height="8"
            viewBox="0 0 14 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2.64184 0.497184C2.34905 0.204389 1.87433 0.204389 1.58154 0.497184L1.05138 1.02734C0.758588 1.32013 0.758588 1.79485 1.05138 2.08764L6.46654 7.5028C6.61373 7.64999 6.80688 7.72318 6.99978 7.7224C7.19268 7.72318 7.38583 7.64999 7.53301 7.5028L12.9482 2.08764C13.241 1.79485 13.241 1.32013 12.9482 1.02734L12.418 0.497184C12.1252 0.204389 11.6505 0.204389 11.3577 0.497184L6.99978 4.85512L2.64184 0.497184Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
      {parsedReasoningContent && (
        <div
          className={`transition-all duration-300 overflow-hidden ${
            isExpanded ? 'h-[300px] flex flex-col opacity-100 mt-4' : 'max-h-0 opacity-0'
          } ${s.collapseWrapper}`}
          ref={scrollRef}
        >
          <MessageContent message={parsedReasoningContent} isAnimate={isReasoning} />
        </div>
      )}
    </div>
  ) : null;
};

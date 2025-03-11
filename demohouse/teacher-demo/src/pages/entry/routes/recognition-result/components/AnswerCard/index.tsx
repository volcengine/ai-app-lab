import { useEffect, useRef, useState } from 'react';
import { CAMER_MODE } from '@/types';
import { STAGE } from '@/pages/entry/routes/recognition-result';

import styles from './index.module.less';
import { ChatBlock } from '../ChatBlock';
import { FloatingPanelRef } from 'antd-mobile';

export interface IQuestion {
  questionId: string; // 题目id,前端mock
  questionBase64: string;
  questionCornerPoints?: any; // 题目边界定点
  questionBoundingBox?: any;
  questionStatus: EQUESTIONSTATUS; // 题目状态
  questionVlmData?: string; // vlm 识别结果
  questionReasoningData?: string; // reasoning 过程
  questionReasoningStartTime?: number; // reasoning 开始时间
  questionReasoningEndTime?: number; // reasoning 结束时间
  isCollapsed?: boolean; // reasoning 过程是否折叠
  questionDeepseekData?: string; // deepseek 解题结果
}

export enum EQUESTIONSTATUS {
  CORRECTING, // 单题-解题中 or 多题目-批改中
  DONE, // 单题-解题完成
  TRUE, // 批改结果：正确
  FALSE, // 批改结果：错误
  NONE // 批改结果：无
}

interface QuestionPageProps {
  mode: CAMER_MODE;
  stage: STAGE;
  questions: IQuestion[];
  selectedQuestionIndex: number;
  setSelectedQuestionIndex: (index: number) => void;
  questionAbortController?: any;
  panelRef?: FloatingPanelRef;
}
export interface IMessage {
  vlmContent?: string;
  reasoning?: string;
  reasoningStartTime?: number;
  reasoningEndTime?: number;
  isCollapsed?: boolean;
  deepseekContent?: string;
  userContent?: string;
  role: 'user' | 'assistant';
}
export const AnswerCard: React.FC<QuestionPageProps> = ({
  setSelectedQuestionIndex,
  selectedQuestionIndex,
  stage,
  questions,
  mode,
  questionAbortController,
  panelRef
}) => {
  const isSingleMode = questions.length === 1;
  const numberOptionsRef = useRef<HTMLDivElement>(null);
  // 多题目批改结束
  const isMultiHomeworkDone =
    questions.length > 1 && questions.every((item) => item.questionStatus !== EQUESTIONSTATUS.CORRECTING);
  const [isMultiHomeworkDoneVisible, setIsMultiHomeworkDoneVisible] = useState(true);
  useEffect(() => {
    if (isMultiHomeworkDone) {
      setTimeout(() => {
        setIsMultiHomeworkDoneVisible(false);
      }, 2000);
    }
  }, [isMultiHomeworkDone]);
  //
  const renderQuestionNumbers = () => (
    <div className="flex mt-1 flex-nowrap overflow-scroll gap-[14px]">
      {questions.map((q, i) => (
        <div
          key={i + 1}
          className={`h-[28px] whitespace-nowrap shrink-0 text-sm rounded-md ${
            selectedQuestionIndex === i + 1
              ? ' w-[61px]' // 选中状态宽度更大
              : ' w-[33px]' // 未选中状态保持原有宽度
          } flex items-center justify-center text-lg py-1 px-3 font-medium  ${
            q.questionStatus === EQUESTIONSTATUS.CORRECTING ? `bg-[#F0F4FA] text-[#C7CCD6]` : ''
          } ${
            q.questionStatus === EQUESTIONSTATUS.DONE || q.questionStatus === EQUESTIONSTATUS.NONE
              ? 'bg-[#F0F4FA] text[#737A87]'
              : ''
          }  ${
            q.questionStatus === EQUESTIONSTATUS.TRUE
              ? selectedQuestionIndex === i + 1
                ? 'bg-[#10C374] text-white'
                : 'bg-[#F0FAF0] text-[#0A802D]'
              : ''
          }
           ${
             q.questionStatus === EQUESTIONSTATUS.FALSE
               ? selectedQuestionIndex === i + 1
                 ? 'bg-[#F53F3F] text-white'
                 : 'bg-[#FAF2F0] text-[#F53F3F]'
               : ''
           }`}
          onClick={() => {
            setSelectedQuestionIndex(i + 1);
            panelRef?.setHeight(window.innerHeight * 0.8);
            if (numberOptionsRef?.current && numberOptionsRef?.current.offsetWidth) {
              numberOptionsRef.current.scrollTo({
                left: numberOptionsRef.current.offsetWidth * i
              });
            }
          }}
        >
          {selectedQuestionIndex === i + 1 ? <>第{i + 1}题</> : i + 1}
        </div>
      ))}
    </div>
  );
  //
  return (
    <div className={`${isSingleMode ? 'flex flex-col-reverse' : 'h-full'} `}>
      <div className={`${styles.answerCard} ${isSingleMode ? '' : 'h-auto'} text-xs`}>
        {/* 单题目识别中展示 */}
        {(isSingleMode || mode === CAMER_MODE.PHOTO_SOLVE || mode === CAMER_MODE.LIVE_SOLVE) &&
          questions.some((q) => q.questionStatus === EQUESTIONSTATUS.CORRECTING) && (
            <p className="text-gray-500 flex gap-1 items-center mb-3 text-sm">
              <svg width="14" height="23" viewBox="0 0 14 23" fill="none" xmlns="http://www.w3.org/2000/svg">
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
              <span>正在识别中...</span>
            </p>
          )}
        {/* 单题解题完成展示*/}
        {(isSingleMode || mode === CAMER_MODE.PHOTO_SOLVE || mode === CAMER_MODE.LIVE_SOLVE) &&
          questions.every((q) => q.questionStatus === (EQUESTIONSTATUS.DONE || EQUESTIONSTATUS.NONE)) && (
            <p className="text-gray-500 mb-3 flex items-center gap-[6px] text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M0.99707 7.99821C0.99707 11.8643 4.13052 14.998 7.99723 14.998C11.8633 14.998 14.9971 11.8643 14.9971 7.99821C14.9971 4.13182 11.8633 0.998047 7.99723 0.998047C4.13084 0.998047 0.997708 4.13182 0.99707 7.99821ZM10.8793 5.77266L11.5877 6.48137C11.6161 6.50984 11.6388 6.54365 11.6542 6.58086C11.6696 6.61806 11.6775 6.65795 11.6775 6.69822C11.6775 6.7385 11.6696 6.77839 11.6542 6.81559C11.6388 6.8528 11.6161 6.88661 11.5877 6.91508L7.45263 11.0504C7.42416 11.0789 7.39036 11.1015 7.35315 11.1169C7.31594 11.1324 7.27606 11.1403 7.23578 11.1403C7.1955 11.1403 7.15562 11.1324 7.11841 11.1169C7.0812 11.1015 7.0474 11.0789 7.01893 11.0504L4.4065 8.43799C4.378 8.40952 4.3554 8.37571 4.33998 8.3385C4.32456 8.30129 4.31662 8.26141 4.31662 8.22113C4.31662 8.18086 4.32456 8.14097 4.33998 8.10377C4.3554 8.06656 4.378 8.03275 4.4065 8.00428L5.11489 7.2962C5.14337 7.26766 5.17719 7.24502 5.21443 7.22957C5.25167 7.21412 5.29159 7.20617 5.3319 7.20617C5.37222 7.20617 5.41214 7.21412 5.44938 7.22957C5.48662 7.24502 5.52044 7.26766 5.54892 7.2962L7.23562 8.98195L10.4459 5.77266C10.5034 5.71521 10.5813 5.68294 10.6626 5.68294C10.7438 5.68294 10.8218 5.71521 10.8793 5.77266Z"
                  fill="#0CCC75"
                />
              </svg>
              生成完毕
            </p>
          )}
        {/* 多题目，批改中*/}
        {!isSingleMode && mode === CAMER_MODE.HOMEWORK_CORRECTION && !isMultiHomeworkDone && (
          <div className="pt-2 pb-[18px] text-lg font-semibold flex gap-2 items-center ">
            <svg width="14" height="23" viewBox="0 0 14 23" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            题目正在努力批改中
          </div>
        )}
        {/* 多题目，批改完成*/}
        {!isSingleMode &&
          mode === CAMER_MODE.HOMEWORK_CORRECTION &&
          isMultiHomeworkDone &&
          isMultiHomeworkDoneVisible && (
            <div className={`py-[18px] text-lg duration-1000 font-semibold flex gap-2 items-center`}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="9" fill="#0CCC75" />
                <path
                  d="M14 7L9.86051 13.261L7 10.4142"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              批改完成
            </div>
          )}
        {/* 多题目顶部，题号*/}
        {!isSingleMode && renderQuestionNumbers()}
        {/* 当前题目的内容展示区域，单多题通用 */}
        <div
          ref={numberOptionsRef}
          className={`flex flex-nowrap flex-row mt-3 overflow-scroll h-full ${styles.mdBox}`}
        >
          {questions.map((q, idx) => (
            <ChatBlock
              key={idx}
              idx={idx}
              hidden={idx !== selectedQuestionIndex - 1}
              onLLMAbort={() => {
                const qid = questions[selectedQuestionIndex - 1].questionId;
                questionAbortController?.current[qid] && questionAbortController.current[qid]();
              }}
              initMessage={{
                vlmContent: questions[idx]?.questionVlmData,
                deepseekContent: questions[idx]?.questionDeepseekData,
                reasoning: questions[idx]?.questionReasoningData,
                reasoningStartTime: questions[idx]?.questionReasoningStartTime,
                reasoningEndTime: questions[idx]?.questionReasoningEndTime,
                state: questions[idx]?.questionStatus,
                isCollapsed: questions[idx]?.isCollapsed,
                role: 'assistant'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
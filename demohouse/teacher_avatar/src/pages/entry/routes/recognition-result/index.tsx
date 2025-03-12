/* eslint-disable max-lines-per-function */
import React, { useContext, useEffect, useState } from 'react';

import { AnswerCard, EQUESTIONSTATUS, IQuestion } from './components/AnswerCard';
import { LLMApi } from '@/api/llm';
import './index.css';
import { close, getCameraImage } from '@ai-app/bridge-api/procode';
import { getViewContext } from '@ai-app/framework';
import { CAMER_MODE } from '@/types';
import { RouterContext } from '../../context/routerContext/context';
import { FloatingPanel } from 'antd-mobile';
import style from './index.module.less';
import { genId, parseVLMCorrectionResult } from '@/pages/entry/utils';
import BoxMask from './components/BoxMask';

type FloatingPanelRef = {
  setHeight: (
    height: number,
    options?: {
      immediate?: boolean; // 是否跳过动画
    }
  ) => void;
};
export enum STAGE {
  // 未开始
  IDLE = 0,
  // vlm 识别中
  VLM_RECOGNITION = 1,
  // deepseek 思考中
  DEEP_SEEK_REASONING = 2,
  // deepseek 输出中
  DEEP_SEEK_RESPONSE = 3,
  // 输出完成
  RESOLVED = 4
}

// 题目状态, 批改中,批改正确，批改错误

export const RecognitionResult = () => {
  const currentViewContext: any = getViewContext();

  const { query, navigate } = useContext(RouterContext);
  // 阶段
  const [stage, setStage] = useState<STAGE>(STAGE.IDLE);
  const [base64, setBase64] = useState('');
  const questionAbortController = React.useRef<any>({});
  const floatingPanelRef = React.useRef<FloatingPanelRef>(null);
  const [homework, setHomework] = useState<IQuestion[]>([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(1);
  const updateCollapse = (isCollapsed: boolean, qid: string) => {
    setHomework((questions) =>
      questions.map((item) =>
        item.questionId === qid
          ? {
              ...item,
              isCollapsed
            }
          : item
      )
    );
  };
  const updateHomeworkStatus = ({
    questionId,
    questionStatus,
    questionVlmData = '',
    questionReasoningData = '',
    questionDeepseekData = ''
  }: {
    questionId: string;
    questionStatus?: EQUESTIONSTATUS;
    questionVlmData?: string;
    questionReasoningData?: string;
    questionDeepseekData?: string;
  }) => {
    setHomework((questions) =>
      questions.map((item) => {
        if (questionDeepseekData && !item.questionReasoningEndTime && item.questionId === questionId) {
          updateCollapse(true, item.questionId);
        }
        return item.questionId === questionId
          ? {
              ...item,
              questionStatus: questionStatus || item.questionStatus,
              questionVlmData: (item.questionVlmData || '') + questionVlmData,
              questionReasoningData: (item.questionReasoningData || '') + questionReasoningData,
              questionReasoningStartTime:
                questionReasoningData && !item.questionReasoningStartTime
                  ? Date.now()
                  : item.questionReasoningStartTime,
              questionReasoningEndTime:
                questionDeepseekData && !item.questionReasoningEndTime
                  ? Date.now()
                  : item.questionReasoningEndTime,
              questionDeepseekData: (item.questionDeepseekData || '') + questionDeepseekData,
              isCollapsed:
                (questionDeepseekData && !item.questionReasoningEndTime) || Boolean(item.isCollapsed)
            }
          : item;
      })
    );
  };
  const imageRef = React.useRef<HTMLImageElement>(null);
  const getImageScale = (imgElement: HTMLImageElement): { x: number; y: number } => {
    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = imgElement;
    const scaleX = clientWidth / naturalWidth;
    const scaleY = clientHeight / naturalHeight;

    return {
      x: scaleX,
      y: scaleY
    };
  };
  // 封装一个做一道题的方法，用于批量调用
  const doHomework = ({
    questionId,
    questionBase64,
    mode
  }: {
    questionId: string;
    questionBase64: string;
    mode: CAMER_MODE;
  }) => {
    LLMApi.VLMChat(questionBase64, mode)
      .then(({ cb, handle }) => {
        questionAbortController.current[questionId] = function () {
          handle.abort.bind(handle)();
          updateHomeworkStatus({
            questionId,
            questionStatus:
              mode === CAMER_MODE.HOMEWORK_CORRECTION ? EQUESTIONSTATUS.FALSE : EQUESTIONSTATUS.DONE
          });
        };
        cb(
          (text) => {
            updateHomeworkStatus({
              questionId,
              questionVlmData: text
            });
          },
          (text) => {
            updateHomeworkStatus({
              questionId,
              questionReasoningData: text
            });
          },
          (text) => {
            updateHomeworkStatus({
              questionId,
              questionDeepseekData: text
            });
          },
          (deepseekData = '') => {
            // 批改结果解析
            if (mode === CAMER_MODE.HOMEWORK_CORRECTION) {
              const questionCorrectionResult = parseVLMCorrectionResult(deepseekData);
              updateHomeworkStatus({
                questionId,
                questionStatus: questionCorrectionResult
              });
            } else {
              updateHomeworkStatus({
                questionId,
                questionStatus: EQUESTIONSTATUS.DONE
              });
            }
          }
        );
      })
      .catch((err) => {
        updateHomeworkStatus({
          questionId: homework[0].questionId,
          questionStatus: EQUESTIONSTATUS.FALSE
        });
      });
  };
  // 识别结果渲染类型：solve-解题，correct-批改
  const mode = currentViewContext.camera_mode as CAMER_MODE;
  useEffect(() => {
    getCameraImage({ imageId: currentViewContext.image_id }).then((res) => {
      setBase64(`data:image/jpeg;base64,${res.base64Image}`);
    });
  }, []);
  useEffect(() => {
    if (!base64) {
      return;
    }
    if (!query.detectedQuestions) {
      return;
    }
    // 单题
    if (query.detectedQuestions.length === 1 && !homework.length) {
      setHomework([
        {
          questionId: genId(),
          questionBase64: `data:image/jpeg;base64,${query.detectedQuestions[0].questionImage}`,
          questionCornerPoints: query.detectedQuestions[0].cornerPoints,
          questionBoundingBox: query.detectedQuestions[0].boundingBox,
          questionStatus: EQUESTIONSTATUS.CORRECTING
        }
      ]);
      // 多题
    } else if (query.detectedQuestions.length > 1 && !homework.length) {
      setHomework(
        query.detectedQuestions.map((item: any) => ({
          questionId: genId(),
          questionBase64: `data:image/jpeg;base64,${item.questionImage}`,
          questionCornerPoints: item.cornerPoints,
          questionBoundingBox: item.boundingBox,
          questionStatus: EQUESTIONSTATUS.CORRECTING
        }))
      );
    }
    if (stage === STAGE.IDLE && homework.length === 1) {
      floatingPanelRef?.current?.setHeight(window.innerHeight * 0.8);
      setStage(STAGE.VLM_RECOGNITION);
      doHomework({
        questionId: homework[0].questionId,
        questionBase64: homework[0].questionBase64,
        mode
      });
      return;
    }
    // 批量题目批改
    if (stage === STAGE.IDLE && homework.length > 1) {
      setStage(STAGE.VLM_RECOGNITION);
      floatingPanelRef?.current?.setHeight(window.innerHeight * 0.5);
      homework.forEach((item) => {
        doHomework({
          questionId: item.questionId,
          questionBase64: item.questionBase64,
          mode
        });
      });
    }
  }, [mode, base64, stage, homework]);

  return (
    <div className={`min-h-screen w-full h-full ${style.resultPage}`}>
      {/* 返回按钮*/}
      <div className={`${style.band}`}>
        <span className="relative top-[2px]">Powred by</span>{' '}
        <svg xmlns="http://www.w3.org/2000/svg" width="68" height="22" viewBox="0 0 68 22" fill="none">
          <path
            d="M7.31128 0C6.96878 0 6.67743 0.240184 6.64332 0.55853C6.63622 0.616799 6.63053 0.673642 6.62485 0.731911C6.39319 3.02002 6.2667 5.3124 6.38182 7.60904C6.44009 8.75452 6.83518 20.0174 6.88919 21.5935C6.89629 21.8209 7.08389 22 7.31128 22C7.53725 22 7.72201 21.8195 7.72911 21.5935C7.79022 19.8171 8.18389 8.75594 8.24216 7.60904C8.3587 5.3124 8.23079 3.02002 7.99913 0.731911C7.99345 0.673642 7.98634 0.616799 7.98066 0.55853C7.94513 0.241605 7.65521 0 7.31271 0H7.31128Z"
            fill="white"
          />
          <path
            d="M2.37846 11.7468C2.32161 11.3318 2.28324 10.9296 2.18091 10.5388C2.1198 10.3043 1.89384 10.1366 1.63376 10.1366C1.37368 10.1366 1.14914 10.3029 1.0866 10.5388C0.984279 10.9296 0.945905 11.3318 0.889058 11.7468C0.775363 12.4958 0.904693 13.2376 0.971489 13.9781C1.01981 14.5352 1.13919 15.8242 1.20883 16.3785C1.22162 16.4765 1.23441 16.576 1.2472 16.6741C1.26283 16.8745 1.42769 17.0336 1.63234 17.0336C1.83699 17.0336 2.00185 16.8745 2.01748 16.6741C2.03027 16.576 2.04307 16.4765 2.05586 16.3785C2.12549 15.8242 2.24487 14.5352 2.29319 13.9781C2.36141 13.2376 2.49074 12.4958 2.37562 11.7468H2.37846Z"
            fill="white"
          />
          <path
            d="M10.9654 4.90541C10.9554 4.81019 10.9355 4.71497 10.9199 4.61975C10.8773 4.36109 10.6399 4.17065 10.36 4.17065C10.3528 4.17065 10.3472 4.17208 10.3401 4.17208C10.3329 4.17208 10.3273 4.17065 10.3202 4.17065C10.0402 4.17065 9.80142 4.36252 9.76021 4.61975C9.74458 4.71497 9.72468 4.81019 9.71473 4.90541C9.47597 7.23474 9.42907 7.85437 9.49302 10.0714C9.50866 10.6001 9.74031 16.7567 9.9137 19.3887C9.92791 19.6005 10.1041 19.7639 10.3159 19.7639C10.3244 19.7639 10.3315 19.7625 10.3386 19.7611C10.3472 19.7611 10.3543 19.7639 10.3614 19.7639C10.5731 19.7639 10.7494 19.6005 10.7636 19.3887C10.937 16.7567 11.17 10.5987 11.1842 10.0714C11.2482 7.85437 11.2013 7.23474 10.9625 4.90541H10.9654Z"
            fill="white"
          />
          <path
            d="M13.7352 11.7468C13.6783 11.3318 13.6399 10.9296 13.5376 10.5388C13.4765 10.3043 13.2505 10.1366 12.9904 10.1366C12.7304 10.1366 12.5058 10.3029 12.4433 10.5388C12.341 10.9296 12.3026 11.3318 12.2457 11.7468C12.1321 12.4958 12.2614 13.2376 12.3282 13.9781C12.3765 14.5352 12.4959 15.8242 12.5655 16.3785C12.5783 16.4765 12.5911 16.576 12.6039 16.6741C12.6181 16.8745 12.7844 17.0336 12.989 17.0336C13.1937 17.0336 13.36 16.8745 13.3742 16.6741C13.387 16.576 13.3998 16.4765 13.4125 16.3785C13.4822 15.8242 13.6016 14.5352 13.6499 13.9781C13.7181 13.2376 13.8474 12.4958 13.7323 11.7468H13.7352Z"
            fill="white"
          />
          <path
            d="M4.90824 4.90541C4.8983 4.81019 4.87841 4.71497 4.86277 4.61975C4.82014 4.36109 4.5828 4.17065 4.30283 4.17065C4.29572 4.17065 4.29003 4.17208 4.28293 4.17208C4.27582 4.17208 4.27013 4.17065 4.26303 4.17065C3.98305 4.17065 3.74429 4.36252 3.70308 4.61975C3.68745 4.71497 3.66755 4.81019 3.6576 4.90541C3.41884 7.23474 3.37194 7.85437 3.4359 10.0714C3.45153 10.6001 3.68318 16.7567 3.85657 19.3887C3.87078 19.6005 4.04701 19.7639 4.25877 19.7639C4.2673 19.7639 4.2744 19.7625 4.2815 19.7611C4.29003 19.7611 4.29713 19.7639 4.30424 19.7639C4.516 19.7639 4.69223 19.6005 4.70644 19.3887C4.87982 16.7567 5.1129 10.5987 5.12711 10.0714C5.19107 7.85437 5.14417 7.23474 4.90541 4.90541H4.90824Z"
            fill="white"
          />
          <path
            d="M41.9873 7.80103H40.9853C40.883 7.80103 40.7991 7.88346 40.7991 7.98578V16.9094H37.7223V6.54328C37.7223 6.44095 37.6384 6.35852 37.5375 6.35852H36.5356C36.4332 6.35852 36.3494 6.44095 36.3494 6.54328V16.9094H33.2725V7.98578C33.2725 7.88346 33.1887 7.80103 33.0878 7.80103H32.0844C31.9821 7.80103 31.8997 7.88346 31.8997 7.98578V18.0975C31.8997 18.1999 31.9835 18.2823 32.0844 18.2823H41.9887C42.091 18.2823 42.1734 18.1999 42.1734 18.0975V7.98578C42.1734 7.88346 42.0896 7.80103 41.9887 7.80103H41.9873Z"
            fill="white"
          />
          <path
            d="M27.3502 12.2339H28.5483C28.652 12.2339 28.7174 12.1501 28.733 12.0676C29.0016 9.99553 29.0784 8.71646 29.0997 8.13661C29.0997 8.03429 29.0159 7.95044 28.915 7.95044H27.7283C27.6231 7.95044 27.5421 8.02434 27.5435 8.1224C27.525 8.59139 27.454 9.91168 27.1768 12.0179C27.1697 12.0662 27.1839 12.1174 27.2166 12.1586C27.2479 12.1984 27.2934 12.2254 27.3502 12.2339Z"
            fill="white"
          />
          <path
            d="M19.3263 12.2117C19.3547 12.2344 19.3888 12.2472 19.4186 12.2472C19.4257 12.2472 19.4343 12.2472 19.44 12.2443H20.6508C20.7105 12.2443 20.7617 12.2216 20.7958 12.1818C20.8285 12.1434 20.8427 12.0937 20.8356 12.0397C20.5598 9.90933 20.4874 8.58052 20.4689 8.10869C20.4689 8.01631 20.3822 7.9353 20.2827 7.9353H19.0847C18.9823 7.9353 18.8999 8.01915 18.8999 8.1229C18.9212 8.70417 18.9994 9.99176 19.2666 12.0852C19.2666 12.1349 19.2893 12.1804 19.3263 12.2102V12.2117Z"
            fill="white"
          />
          <path
            d="M29.4593 16.9136C28.5383 16.817 27.4113 16.1945 26.5188 15.2906C25.3677 14.1167 24.7338 12.6231 24.7068 11.0654C24.7068 11.0015 24.7125 10.9404 24.7125 10.875V6.36273C24.7125 6.26041 24.6287 6.17798 24.5278 6.17798H23.4889C23.3865 6.17798 23.3041 6.26041 23.3041 6.36273V10.875C23.3041 10.9375 23.3084 10.9972 23.3098 11.0583C23.2814 12.6131 22.6461 14.1054 21.4978 15.2778C20.6053 16.1817 19.4783 16.8042 18.5545 16.9023C18.455 16.9193 18.3896 16.9918 18.3896 17.087L18.4024 18.1145C18.4024 18.1671 18.428 18.2211 18.4721 18.2581C18.5048 18.2865 18.546 18.3021 18.5829 18.3021C18.59 18.3021 18.5971 18.3021 18.6042 18.3007C19.9117 18.1756 21.35 17.4679 22.45 16.4034C22.9829 15.889 23.5685 15.1684 24.0104 14.212C24.4524 15.167 25.038 15.889 25.5709 16.402C26.6581 17.4636 28.0949 18.1728 29.4138 18.2993C29.4223 18.3007 29.4309 18.3007 29.4394 18.3007C29.4806 18.3007 29.5204 18.2865 29.5531 18.2581C29.5943 18.2226 29.6185 18.1685 29.6185 18.1145L29.6312 17.0984C29.6312 17.0032 29.5659 16.9307 29.4635 16.9136H29.4593Z"
            fill="white"
          />
          <path
            d="M54.5075 7.57072H50.0592V6.34992C50.0592 6.24759 49.9754 6.16516 49.8745 6.16516H48.8711C48.7688 6.16516 48.6864 6.24759 48.6864 6.34992V7.57072H44.2252C44.1229 7.57072 44.0391 7.65315 44.0391 7.75547V8.75883C44.0391 8.86116 44.1229 8.94359 44.2252 8.94359H46.2973C46.2803 9.8972 46.222 11.4349 46.0216 12.7978C45.6862 15.0504 44.9898 17.0671 44.6047 18.0705C44.5876 18.1216 44.5962 18.1785 44.626 18.2211C44.6559 18.2609 44.7013 18.2851 44.7511 18.2851H45.8639C45.9307 18.2851 45.9975 18.2396 46.0344 18.1657C46.394 17.1879 47.0463 15.2167 47.3703 12.9954C47.4016 12.7794 47.4286 12.5605 47.4542 12.3416H52.5875V16.8369H50.5353C50.433 16.8369 50.3506 16.9193 50.3506 17.0216V18.025C50.3506 18.1273 50.4344 18.2097 50.5353 18.2097H53.7756C53.8779 18.2097 53.9618 18.1273 53.9618 18.025V12.1811C53.9618 12.1811 53.959 12.1725 53.959 12.1683C53.959 12.164 53.9618 12.1597 53.9618 12.1555V11.1521C53.9618 11.0498 53.8779 10.9674 53.7756 10.9674H47.5807C47.6347 10.1985 47.6588 9.48932 47.6688 8.94216H54.509C54.6113 8.94216 54.6937 8.85973 54.6937 8.75741V7.75405C54.6937 7.65172 54.6099 7.5693 54.509 7.5693L54.5075 7.57072Z"
            fill="white"
          />
          <path
            d="M67.4931 11.813H66.3945V7.26658C66.3945 7.16426 66.3107 7.08183 66.2084 7.08183H62.8842V6.34992C62.8842 6.24759 62.8004 6.16516 62.6994 6.16516H61.6961C61.5938 6.16516 61.5113 6.24759 61.5113 6.34992V7.08183H58.335C58.2327 7.08183 58.1488 7.16426 58.1488 7.26658C58.1488 8.1463 58.1488 10.2269 58.0934 11.813H56.6224C56.5201 11.813 56.4363 11.8954 56.4363 11.9977V13.0011C56.4363 13.1034 56.5201 13.1858 56.6224 13.1858H58.0195C57.8433 15.3517 57.3501 17.0245 56.9522 18.0705C56.9351 18.1216 56.9436 18.1785 56.9735 18.2211C57.0033 18.2609 57.0488 18.2851 57.0985 18.2851H58.2113C58.2781 18.2851 58.3449 18.2396 58.3819 18.1657C58.6874 17.3144 59.2104 15.5635 59.398 13.1858H65.0202V16.8383H63.8975C63.7952 16.8383 63.7113 16.9207 63.7113 17.023V18.0264C63.7113 18.1287 63.7952 18.2112 63.8975 18.2112H66.2084C66.3107 18.2112 66.3945 18.1287 66.3945 18.0264V13.1858H67.4931C67.5954 13.1858 67.6779 13.1034 67.6779 13.0011V11.9977C67.6779 11.8954 67.594 11.813 67.4931 11.813ZM65.0202 11.813H59.4677C59.5032 10.7286 59.516 9.44953 59.5203 8.4547H65.0217V11.813H65.0202Z"
            fill="white"
          />
          <path
            d="M61.1717 9.34945L61.7814 11.0563C61.7999 11.133 61.8852 11.1799 61.9534 11.1799H63.0179C63.0832 11.1799 63.1415 11.1501 63.1742 11.1004C63.2054 11.052 63.2097 10.9938 63.1884 10.9412L62.5744 9.21159C62.5403 9.14338 62.4735 9.0979 62.4068 9.0979H61.3423C61.2783 9.0979 61.2229 9.12632 61.1888 9.17464C61.1547 9.22438 61.1476 9.28834 61.1717 9.34945Z"
            fill="white"
          />
          <path
            d="M62.4636 13.9321C62.4295 13.8638 62.3627 13.8184 62.296 13.8184H61.2329C61.169 13.8184 61.1135 13.8468 61.0794 13.8951C61.0453 13.9448 61.0382 14.0088 61.0624 14.0699L61.8184 16.2045C61.8369 16.2784 61.908 16.3282 61.9904 16.3282H63.0549C63.1188 16.3282 63.1742 16.3012 63.2083 16.2514C63.2425 16.2017 63.2496 16.1377 63.2254 16.0766L62.4651 13.9321H62.4636Z"
            fill="white"
          />
        </svg>{' '}
      </div>
      <div
        className={style.escape}
        onClick={() => {
          close();
        }}
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M13.9999 25.6667C20.4432 25.6667 25.6666 20.4433 25.6666 14C25.6666 7.55669 20.4432 2.33334 13.9999 2.33334C7.55659 2.33334 2.33325 7.55669 2.33325 14C2.33325 20.4433 7.55659 25.6667 13.9999 25.6667Z"
            fill="#333333"
            stroke="#333333"
            strokeWidth="2.33333"
            strokeLinejoin="round"
          />
          <path
            d="M18.9536 14.2917H8.45361"
            stroke="white"
            strokeWidth="2.33333"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.7036 9.04166L8.45361 14.2917L13.7036 19.5417"
            stroke="white"
            strokeWidth="2.33333"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="relative">
        <div className={style.image}>
          <img ref={imageRef} className={'w-full rounded-2xl'} src={base64} />
        </div>
        {/* 遮罩 */}
        {homework.map((item, index: number) => (
          <BoxMask
            onClick={() => {
              setSelectedQuestionIndex(index + 1);
              floatingPanelRef?.current?.setHeight(window.innerHeight * 0.8);
            }}
            idx={index}
            isSelected={index + 1 === selectedQuestionIndex}
            key={item.questionId}
            status={item.questionStatus}
            position={
              imageRef.current
                ? {
                    x:
                      getImageScale(imageRef.current).x *
                      (item.questionCornerPoints[0].x + (query?.selectRect?.left || 0)),
                    y:
                      getImageScale(imageRef.current).y *
                      (item.questionCornerPoints[0].y + (query?.selectRect?.top || 0))
                  }
                : { x: 0, y: 0 }
            }
            size={
              imageRef.current
                ? {
                    width: getImageScale(imageRef.current).x * item.questionBoundingBox.width,
                    height: getImageScale(imageRef.current).y * item.questionBoundingBox.height
                  }
                : { width: 0, height: 0 }
            }
          />
        ))}
      </div>

      <FloatingPanel
        ref={floatingPanelRef}
        handleDraggingOfContent={false}
        anchors={[150, window.innerHeight * 0.5, window.innerHeight * 0.8]}
      >
        <AnswerCard
          panelRef={floatingPanelRef.current ? floatingPanelRef.current : undefined}
          questionAbortController={questionAbortController}
          selectedQuestionIndex={selectedQuestionIndex}
          setSelectedQuestionIndex={setSelectedQuestionIndex}
          stage={stage}
          mode={mode}
          questions={homework}
        />
      </FloatingPanel>
    </div>
  );
};

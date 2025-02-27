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

import { useContext, useEffect, useRef, useState } from 'react';

import { Slider } from '@arco-design/web-react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import clsx from 'classnames';

import s from './index.module.less';
import { useWatchAndChatMachine } from '../../providers/MachineProvider/useWatchAndChatMachine';
import { WatchAndChatContext } from '../../providers/WatchAndChatProvider/context';
import { BorderGradientFade } from '../BorderGradientFade';

dayjs.extend(duration);

const format = (s: number) => dayjs.duration(s, 'seconds').format('mm:ss');

const IconPause = ({ onClick, visible }: { visible?: boolean; onClick: () => void }) => (
  <svg
    onClick={onClick}
    className={clsx(
      'z-30 cursor-pointer opacity-0 group-hover:opacity-100 absolute left-1/2 -translate-y-1/2 top-1/2 -translate-x-1/2 duration-200',
      !visible && 'opacity-0',
    )}
    xmlns="http://www.w3.org/2000/svg"
    width="102"
    height="102"
    viewBox="0 0 102 102"
    fill="none"
  >
    <path
      d="M40.5 13.8125V88.1875C40.4984 89.596 39.9382 90.9463 38.9423 91.9423C37.9463 92.9382 36.596 93.4984 35.1875 93.5H24.5625C23.154 93.4984 21.8037 92.9382 20.8077 91.9423C19.8118 90.9463 19.2516 89.596 19.25 88.1875V13.8125C19.2516 12.404 19.8118 11.0537 20.8077 10.0577C21.8037 9.0618 23.154 8.50158 24.5625 8.5H35.1875C36.596 8.50158 37.9463 9.0618 38.9423 10.0577C39.9382 11.0537 40.4984 12.404 40.5 13.8125ZM77.4375 8.5H66.8125C65.404 8.50158 64.0537 9.0618 63.0577 10.0577C62.0618 11.0537 61.5016 12.404 61.5 13.8125V88.1875C61.5016 89.596 62.0618 90.9463 63.0577 91.9423C64.0537 92.9382 65.404 93.4984 66.8125 93.5H77.4375C78.846 93.4984 80.1963 92.9382 81.1923 91.9423C82.1882 90.9463 82.7484 89.596 82.75 88.1875V13.8125C82.7484 12.404 82.1882 11.0537 81.1923 10.0577C80.1963 9.0618 78.846 8.50158 77.4375 8.5Z"
      fill="white"
    />
  </svg>
);

const IconPlay = ({ onClick }: { onClick: () => void }) => (
  <svg
    className="z-30 cursor-pointer opacity-0 group-hover:opacity-100 absolute left-1/2 -translate-y-1/2 top-1/2 -translate-x-1/2 duration-200"
    onClick={onClick}
    xmlns="http://www.w3.org/2000/svg"
    width="174"
    height="174"
    viewBox="0 0 174 174"
    fill="none"
  >
    <g filter="url(#filter0_b_497_183577)">
      <path
        d="M125.432 86.5556C125.432 88.9738 124.548 91.4013 122.778 93.3451C122.446 93.7264 120.898 95.2983 119.682 96.3214L119.018 96.8794C109.729 105.352 86.6155 118.094 74.8931 122.177C74.8931 122.27 67.926 124.698 64.6083 124.782H64.166C59.0789 124.782 54.3236 122.373 51.8906 118.466C50.5635 116.318 49.3471 110.086 49.2365 110.003C48.2412 104.413 47.5776 95.8563 47.5776 86.4626C47.5776 76.6131 48.2412 67.6751 49.4576 62.1876C49.4576 62.0946 50.6741 57.0722 51.4482 55.3981C52.6647 52.9892 54.8765 50.9337 57.6412 49.6316C59.853 48.7108 62.1754 48.2365 64.6083 48.2365C67.1519 48.3388 71.9072 49.7246 73.7872 50.3757C86.1732 54.468 109.839 67.8611 118.907 76.0457C120.456 77.3478 122.115 78.9383 122.557 79.301C124.437 81.3472 125.432 83.8584 125.432 86.5556Z"
        fill="white"
      />
    </g>
    <defs>
      <filter
        id="filter0_b_497_183577"
        x="9.95818"
        y="10.6171"
        width="153.093"
        height="151.784"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feGaussianBlur in="BackgroundImageFix" stdDeviation="18.8097" />
        <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_497_183577" />
        <feBlend mode="normal" in="SourceGraphic" in2="effect1_backgroundBlur_497_183577" result="shape" />
      </filter>
    </defs>
  </svg>
);

export const VideoPlayer = () => {
  const { canvasRef, bgVideoRef, videoRef } = useContext(WatchAndChatContext);
  const { state, send } = useWatchAndChatMachine();
  const [playTime, setPlayTime] = useState({ currentTime: 0, duration: 0 });

  const timerRef = useRef<number>();
  const [showPauseButton, setShowPauseButton] = useState(true);

  // 监听鼠标移动事件
  const handleMouseMove = () => {
    !showPauseButton && setShowPauseButton(true);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setShowPauseButton(false);
    }, 3000);
  };

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    const callback = () => {
      if (videoRef?.current?.currentTime) {
        setPlayTime({
          currentTime: videoRef?.current?.currentTime,
          duration: videoRef?.current?.duration,
        });
      }
    };
    videoRef.current?.addEventListener('timeupdate', callback);
    return () => {
      videoRef.current?.removeEventListener('timeupdate', callback);
    };
  }, [videoRef.current]);

  const handleMouseEnter = () => {
    if (videoRef?.current?.duration) {
      setPlayTime({
        currentTime: videoRef?.current?.currentTime,
        duration: videoRef?.current?.duration,
      });
    }
  };

  return (
    <BorderGradientFade border={state.matches('Chat.BotThinking')}>
      <canvas ref={canvasRef} className="hidden" />
      <div className="w-full h-full relative" onMouseMove={handleMouseMove}>
        <video
          onMouseEnter={handleMouseEnter}
          crossOrigin="anonymous"
          loop
          muted
          ref={bgVideoRef}
          className="w-full h-full object-cover blur-lg brightness-90"
        />
        <video
          onMouseEnter={handleMouseEnter}
          crossOrigin="anonymous"
          loop
          ref={videoRef}
          className="z-10 absolute left-0 top-0 w-full h-full object-contain "
        />
        <Slider
          className={s.slider}
          step={0.001}
          onChange={seconds => {
            if (typeof seconds === 'number') {
              videoRef?.current && (videoRef.current.currentTime = seconds);
              setPlayTime({
                ...playTime,
                currentTime: seconds,
              });
            }
          }}
          value={playTime.currentTime}
          max={videoRef?.current?.duration}
          formatTooltip={ms => format(ms)}
        />
      </div>
      {state.matches('VideoPlaying') ? (
        <IconPause visible={showPauseButton} onClick={() => send({ type: 'ChatBot' })} />
      ) : (
        <IconPlay
          onClick={() => {
            send('WatchVideo');
            console.log('#ctx', state.context);
          }}
        />
      )}
    </BorderGradientFade>
  );
};

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

import { FC, PropsWithChildren, useRef, useState } from 'react';

import { defaultBarsData } from '@/hooks/useTrackUserSpeakWave';

import { WatchAndChatContext } from './context';

export const WatchAndChatProvider: FC<PropsWithChildren> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const chatConfigRef = useRef({
    videoUrl: '',
    confirmation: '',
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const streamRef = useRef<MediaStream>(null);
  const [userAudioWaveHeights, setUserAudioWaveHeights] = useState<{
    bar1: number;
    bar2: number;
    bar3: number;
  }>(defaultBarsData);

  return (
    <WatchAndChatContext.Provider
      value={{
        //
        chatConfigRef,
        visible,
        setVisible,
        audioContextRef,
        analyserRef,
        //
        setUserAudioWaveHeights,
        userAudioWaveHeights,
        //
        streamRef,
        canvasRef,
        videoRef,
        bgVideoRef,
        //
      }}
    >
      {children}
    </WatchAndChatContext.Provider>
  );
};

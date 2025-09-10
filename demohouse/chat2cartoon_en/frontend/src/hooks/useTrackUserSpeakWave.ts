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

import { MutableRefObject, useRef } from 'react';

import { barHeightMapping, calculateBarHeights } from '@/utils/calcWaveBarHeight';

const barHeight = barHeightMapping.default;
export const defaultBarsData = {
  bar1: barHeight.min, // 低频
  bar2: barHeight.min, // 中频
  bar3: barHeight.min, // 高频
};

export const useTrackUserSpeakWave = (
  audioContextRef: MutableRefObject<AudioContext | undefined>,
  streamRef: MutableRefObject<MediaStream | null>,
  setUserAudioWaveHeights: (waveHeights: { bar1: number; bar2: number; bar3: number }) => void,
) => {
  const rafIdRef = useRef<number>();

  const resetUserAudioWaveHeights = () => {
    setUserAudioWaveHeights(defaultBarsData);
  };

  /**
   * 开始跟踪用户说话的音波
   */
  const startTrack = () => {
    if (!audioContextRef.current || !streamRef.current) {
      return;
    }
    const ctx = audioContextRef.current;

    const analyser = ctx.createAnalyser();
    const source = ctx.createMediaStreamSource(streamRef.current);

    source.connect(analyser);

    //
    const arr = new Uint8Array(analyser.frequencyBinCount);

    const getAudioData = () => {
      if (streamRef.current) {
        analyser.getByteFrequencyData(arr);
        const waveData = calculateBarHeights(arr);
        setUserAudioWaveHeights(waveData);
      }
      rafIdRef.current = requestAnimationFrame(getAudioData);
    };

    rafIdRef.current = requestAnimationFrame(getAudioData);
  };
  /**
   * 停止跟踪用户说话的音波
   */
  const stopTrack = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      resetUserAudioWaveHeights();
    }
  };

  return {
    stopTrack,
    startTrack,
  };
};

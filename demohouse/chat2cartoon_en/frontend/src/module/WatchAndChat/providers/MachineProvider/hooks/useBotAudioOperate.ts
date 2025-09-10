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

import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { base64ToArrayBuffer } from '@/utils/base64ToArrayBuffer';

import { WatchAndChatContext } from '../../WatchAndChatProvider/context';

export const useBotAudioOperate = () => {
  const resolveRef = useRef<(value: void | PromiseLike<void>) => void>(() => {});
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const { audioContextRef, analyserRef } = useContext(WatchAndChatContext);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioDataRef = useRef<string[]>([]); // 改为存储 base64 字符串
  const audioDataFinishedRef = useRef(false);

  useEffect(() => {
    audioContextRef.current = new AudioContext();
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(audioContextRef.current.destination);
    analyserRef.current = analyser;

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  const processAndPlayAudio = useCallback(async (base64Chunks: string) => {
    if (!audioContextRef.current || !analyserRef.current) {
      return;
    }

    const arrayBuffer = base64ToArrayBuffer(base64Chunks);
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

    sourceRef.current = audioContextRef.current.createBufferSource();
    sourceRef.current.buffer = audioBuffer;

    sourceRef.current.connect(analyserRef.current);
    // sourceRef.current.connect(audioContextRef.current.destination);

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    sourceRef.current.addEventListener('ended', playNextAudio);

    sourceRef.current.start(0);
    setIsPlaying(true);
  }, []);

  const playNextAudio = useCallback(async () => {
    if (audioDataRef.current.length) {
      const chunksToPlay = audioDataRef.current.shift() as string;
      await processAndPlayAudio(chunksToPlay);
    } else {
      setIsPlaying(false);
      if (audioDataFinishedRef.current) {
        resolveRef.current?.();
        audioDataFinishedRef.current = false;
      }
    }
  }, [processAndPlayAudio]);

  const play = useCallback(() => {
    if (!isPlaying) {
      playNextAudio();
    }
  }, [isPlaying, playNextAudio]);

  const stop = useCallback(() => {
    if (isPlaying && sourceRef.current) {
      sourceRef.current.stop();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const addAudio = useCallback(
    (base64data: string) => {
      audioDataRef.current.push(base64data);
      if (!isPlaying && audioDataRef.current.length >= 5) {
        play();
      }
    },
    [isPlaying, play],
  );

  const resetAudio = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      setIsPlaying(false);
    }
    audioDataRef.current = [];
  }, []);

  const playBotAudio = () => (): Promise<void> =>
    new Promise(resolve => {
      play();
      resolveRef.current = resolve;
    });

  const stopBotAudio = () => {
    stop();
    resetAudio();
  };

  const updateAudioData = (_: unknown, event: { data: string }) => {
    addAudio(event.data);
  };

  const markAudioDataFinished = () => {
    console.log('#markAudioDataFinished');
    audioDataFinishedRef.current = true;
  };

  return {
    markAudioDataFinished,
    updateAudioData,
    playBotAudio,
    stopBotAudio,
  };
};

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

import { MutableRefObject, useEffect, useRef } from 'react';

import RecordRTC, { StereoAudioRecorder } from 'recordrtc';

import { handleAsrResp } from '@/utils/handleAsrResp';

import { useTrackUserSpeakWave } from './useTrackUserSpeakWave';
import { AudioData } from '../types/asr';
import { useAsrWs } from './useAsrWs';

// const SegDuration = 100 // 100ms 发一次 如果超过就直接发，如果没有超过就 sleep 到 100ms 再发

const forceDefiniteDuration = 1500; // 2s 不返回新的识别结果 强制结束

export const useAudioRecorder = (setUserAudioWaveHeights: any, streamRef: MutableRefObject<MediaStream | null>) => {
  const isRecordingRef = useRef(false);
  const recorderRef = useRef<RecordRTC | null>(null);
  const audioContextRef = useRef<AudioContext>();
  const resolveRef = useRef<((value: string) => void) | null>(null);

  const lastedAsrResult = useRef('');
  const isAlreadyDefinite = useRef(false);
  const lastMsgTimeRef = useRef(0);
  const timerRef = useRef(0);

  const { close, connect, sendAudio, readyState } = useAsrWs({
    onAsrResp: (resp: AudioData) => {
      lastMsgTimeRef.current = Date.now();
      handleAsrResp(resp, text => {
        console.log('#asr definite', text);
        if (!isAlreadyDefinite.current) {
          isAlreadyDefinite.current = true;
          if (resolveRef.current) {
            resolveRef.current(text);
            resolveRef.current = null;
          }
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          stopRecording();
        }
      });
    },
  });

  const { startTrack, stopTrack } = useTrackUserSpeakWave(audioContextRef, streamRef, setUserAudioWaveHeights);

  const startCheckHealth = () => {
    timerRef.current = window.setInterval(() => {
      if (isAlreadyDefinite.current) {
        return;
      }
      const duration = Date.now() - lastMsgTimeRef.current;
      if (duration > forceDefiniteDuration && lastedAsrResult.current) {
        console.log('#asr no resp over 1.5s, force definite', lastedAsrResult.current);
        if (resolveRef.current) {
          resolveRef.current(lastedAsrResult.current);
          resolveRef.current = null;
        }
        isAlreadyDefinite.current = true;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        stopRecording();
      }
    }, 2000);
  };

  useEffect(
    () => () => {
      timerRef.current && clearInterval(timerRef.current);
    },
    [],
  );

  const recognizeUserAudioText = async (): Promise<string> => {
    if (!streamRef.current) {
      throw new Error('No media stream available');
    }

    if (readyState !== WebSocket.OPEN) {
      await connect();
    }
    return new Promise(resolve => {
      resolveRef.current = resolve;
      isAlreadyDefinite.current = false;
      lastedAsrResult.current = '';
      audioContextRef.current = new AudioContext();

      recorderRef.current && recorderRef.current.destroy();

      recorderRef.current = new RecordRTC(streamRef.current!, {
        type: 'audio',
        recorderType: StereoAudioRecorder,
        mimeType: 'audio/wav',
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        disableLogs: true,
        timeSlice: 100,
        ondataavailable(recordResult: Blob) {
          const ctx = audioContextRef.current;
          if (ctx) {
            ctx.resume();
          }
          const pcm = recordResult.slice(44);
          sendAudio(pcm);
        },
      });

      isRecordingRef.current = true;
      recorderRef.current.startRecording();
      startTrack();
      startCheckHealth();
    });
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stopRecording();
      isRecordingRef.current = false;
      const ctx = audioContextRef.current;
      if (ctx) {
        ctx.suspend();
        stopTrack();
      }
      close();
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  };

  return {
    recognizeUserAudioText,
    stopRecording,
  };
};

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

import { useRef } from 'react';

import type { ASRResponseData } from './LabASR';
import { encodeAudioOnlyRequest, encodeFullClientRequest, parseResponse } from './LabASR/utils';

const url = `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel?api_access_key=${process.env.TTS_ACCESS_TOKEN}&api_app_key=${process.env.TTS_APP_ID}&api_resource_id=volc.bigasr.sauc.duration`;

export const useAsrWs = ({ onAsrResp }: { onAsrResp: (res_json: any) => void }) => {
  const wsRef = useRef<WebSocket>();
  const connect = () =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(url);

      socket.onopen = () => {
        console.log('socket connected');
        const build = encodeFullClientRequest({
          user: {
            uid: 'Portal Experience Center',
          },
          audio: {
            format: 'pcm',
            rate: 16e3,
            bits: 16,
            channel: 1,
          },
          request: {
            // @ts-expect-error
            model_name: 'bigmodel',
            result_type: 'single',
            show_utterances: true,
            // vad_segment_duration 失效
            // 强制判停时间
            end_window_size: 600,
            // 强制语音时间
            force_to_speech_time: 1500,
          },
        });
        socket.send(build);
        resolve(socket);
      };

      socket.onmessage = async e => {
        try {
          const res_json: ASRResponseData = await parseResponse(e.data);
          onAsrResp?.(res_json);
        } catch (error) {
          console.error(error);
          reject(error);
        }
      };

      socket.onerror = error => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      wsRef.current = socket;
    });
  return {
    readyState: wsRef.current?.readyState,
    sendAudio: (pcm: Blob) => {
      const data = encodeAudioOnlyRequest(pcm);
      wsRef.current?.send(data);
    },
    connect,
    close: () => {
      wsRef.current?.close();
      wsRef.current = undefined;
    },
  };
};

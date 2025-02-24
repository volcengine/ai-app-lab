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

import { createContext, MutableRefObject } from 'react';

interface IChatContext {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  chatConfigRef: MutableRefObject<{
    videoUrl: string;
    confirmation: string;
  }>;
  //
  setUserAudioWaveHeights: (data: { bar1: number; bar2: number; bar3: number }) => void;
  userAudioWaveHeights: { bar1: number; bar2: number; bar3: number };
  //
  audioContextRef: MutableRefObject<AudioContext | null>;
  analyserRef: MutableRefObject<AnalyserNode | null>;
  //
  streamRef: MutableRefObject<MediaStream | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  bgVideoRef: MutableRefObject<HTMLVideoElement | null>;
}

export const WatchAndChatContext = createContext<IChatContext>({} as unknown as never);

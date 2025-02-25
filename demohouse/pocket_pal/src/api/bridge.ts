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

import { createAPI, createEvent } from "@ai-app/bridge-base";

/**
 * 创建流式 TTS 播报请求
 */
export const createStreamingTTS = createAPI<
  {
    speaker?: string;
    ttsFormat?: string;
    ttsSampleRate?: number;
  },
  {
    streamingId: string;
  }
>('applet.multimodal.createStreamingTTS');

/**
 * 流式 TTS 播报添加新文本
 */
export const appendStreamingTTS = createAPI<{
  streamingId: string;
  newText: string;
  isFinish: boolean;
}>('applet.multimodal.appendStreamingTTS');

/**
 * 流式 TTS 播报打断
 */
export const cancelStreamingTTS = createAPI<{
  streamingId: string;
}>('applet.multimodal.cancelStreamingTTS');

/**
 * 监听 TTS 结果
 */
export const onTTSFinished = createEvent<{
    streamingId: string;
  }>('applet.multimodal.onStreamingTTSFinished');

/**
 * 复制消息
 */
export const copyMessage = createAPI<{
    message: string;
  }>('applet.multimodal.copyMessage');

/**
 * 赞踩消息
 */
export const likeMessage = createAPI<{
    like?: boolean;
    dislike?: boolean;
  }>('applet.multimodal.likeMessage');

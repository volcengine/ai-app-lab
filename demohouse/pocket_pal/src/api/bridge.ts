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

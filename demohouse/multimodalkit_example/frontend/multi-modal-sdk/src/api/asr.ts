import { createAPI, createEvent } from '../client-api';

/**
 * 开始语音识别(ASR)
 * @returns 返回 Promise 包含 ASR 开启状态
 * @example
 * ```ts
 * import { startASR } from 'multi-modal-sdk';
 *
 * const ASRstatus = await startASR();
 * console.log('ASR 开启状态:', ASRstatus.status);
 * ```
 */
export const startASR = createAPI('applet.multimodal.startASR');

/**
 * 停止语音识别(ASR)
 * @example
 * ```ts
 * import { stopASR } from 'multi-modal-sdk';
 *
 * stopASR();
 * ```
 */
export const stopASR = createAPI('applet.multimodal.stopASR');

/**
 * 监听 ASR 识别结果
 * @param callback - 回调函数
 * @param callback.text - ASR 流式识别的文字结果
 * @param callback.isFinished - 表示识别内容是否结束，true 表示整段话识别结束
 * @example
 * ```ts
 * // 监听流式结果
 * onASRResult(({ text }) => {
 *   console.log('当前识别:', text);
 * });
 *
 * // 监听完整结果
 * onASRResult(({ text, isFinished }) => {
 *   if (isFinished) {
 *     console.log('最终识别结果:', text);
 *   }
 * });
 * ```
 */
export const onASRResult = createEvent<{
  text: string;
  isFinished?: boolean;
}>('applet.multimodal.ASRResult');

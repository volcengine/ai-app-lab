import { createAPI } from '../client-api';

/**
 * 调用客户端封装好的 VLM 模型进行对话，非流式返回
 * @param params - 请求参数
 * @param params.base64Image - 图片的 base64 编码
 * @param params.query - 提问内容
 * @param params.prompt - 可选，system prompt
 * @returns 返回包含回答内容的Promise
 * @example
 * ```ts
 * const { answer } = await chatCompletion({
 *   base64Image: 'data:image/png;base64,...',
 *   query: '图片中有什么?'
 * });
 * ```
 */
export const chatCompletion = createAPI<
  {
    base64Image: string;
    query: string;
    prompt?: string;
  },
  {
    answer: string;
  }
>('applet.multimodal.chatCompletion');

/**
 * 创建一个流式VLM对话请求，返回streamingId用于后续读取
 * @param params - 请求参数
 * @param params.base64Image - 图片的 base64 编码
 * @param params.query - 提问内容
 * @param params.prompt - 可选，system prompt
 * @returns 返回包含streamingId的Promise
 * @example
 * ```ts
 * const { streamingId } = await chatCompletionStreaming({
 *   base64Image: 'data:image/png;base64,...',
 *   query: '图片中有什么?'
 * });
 * ```
 */
export const chatCompletionStreaming = createAPI<
  {
    base64Image: string;
    query: string;
    prompt?: string;
  },
  {
    streamingId: string;
  }
>('applet.multimodal.chatCompletionStreamingRequest');

/**
 * 根据streamingId读取流式VLM对话的返回内容
 * @param params - 请求参数
 * @param params.streamingId - 流式对话ID
 * @returns 返回包含新文本和是否结束标志的Promise
 * @example
 * ```ts
 * const { newText, isFinished } = await readCompletionStreaming({
 *   streamingId: '123'
 * });
 * ```
 */
export const readCompletionStreaming = createAPI<
  {
    streamingId: string;
  },
  {
    newText: string;
    isFinished: boolean;
  }
>('applet.multimodal.chatCompletionStreamingRead');

/**
 * 取消当前的流式VLM对话请求
 * @param params - 请求参数
 * @param params.streamingId - 流式对话ID
 * @example
 * ```ts
 * await cancelCompletionStreaming({
 *   streamingId: '123'
 * });
 * ```
 */
export const cancelCompletionStreaming = createAPI<{
  streamingId: string;
}>('applet.multimodal.cancelCompletionStreaming');

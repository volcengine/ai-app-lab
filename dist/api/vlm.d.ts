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
export declare const chatCompletion: (params: {
    base64Image: string;
    query: string;
    prompt?: string;
}) => Promise<{
    answer: string;
}>;
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
export declare const chatCompletionStreaming: (params: {
    base64Image: string;
    query: string;
    prompt?: string;
}) => Promise<{
    streamingId: string;
}>;
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
export declare const readCompletionStreaming: (params: {
    streamingId: string;
}) => Promise<{
    newText: string;
    isFinished: boolean;
}>;
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
export declare const cancelCompletionStreaming: (params: {
    streamingId: string;
}) => Promise<object>;

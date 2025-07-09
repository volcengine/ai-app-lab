/**
 * 开始文字转语音(TTS)播报
 * @param params - 播报参数
 * @param params.text - 需要播报的文本内容
 * @param params.config - 可选配置
 * @param params.config.speaker - 指定音色，可选值：
 *   - zh_female_tianmeixiaoyuan_moon_bigtts
 *   - zh_female_kailangjiejie_moon_bigtts
 *   - zh_male_dongfanghaoran_moon_bigtts
 *   - en_male_jason_conversation_wvae_bigtts
 *   - en_female_sarah_new_conversation_wvae_bigtts
 *   如不指定则使用默认音色
 * @example
 * ```ts
 * // 使用中文女声音色播报
 * startTTS({
 *   text: '你好，欢迎使用我们的服务',
 *   config: { speaker: 'zh_female_tianmeixiaoyuan_moon_bigtts' }
 * });
 * ```
 */
export declare const startTTS: (params: {
    text: string;
    config?: {
        speaker?: string;
    };
}) => Promise<object>;
/**
 * 取消当前正在进行的TTS播报
 * @example
 * ```ts
 * // 取消播报
 * cancelTTS();
 * ```
 */
export declare const cancelTTS: (params?: object | undefined) => Promise<object>;
/**
 * 创建流式TTS会话
 * @param params - 配置参数
 * @param params.speaker - 可选，音色设置，默认"zh_female_kailangjiejie_moon_bigtts"
 * @param params.ttsFormat - 可选，音频格式，默认"pcm"
 * @param params.ttsSampleRate - 可选，采样率，默认24000
 * @returns 返回包含streamingId的Promise
 * @example
 * ```ts
 * const { streamingId } = await createStreamingTTS();
 * ```
 */
export declare const createStreamingTTS: (params?: {
    speaker?: string;
    ttsFormat?: string;
    ttsSampleRate?: number;
} | undefined) => Promise<{
    streamingId: string;
}>;
/**
 * 向流式TTS会话追加文本
 * @param params - 请求参数
 * @param params.streamingId - 流式会话ID
 * @param params.newText - 新增要播报的文本
 * @param params.isFinish - 是否结束流式会话
 * @example
 * ```ts
 * await appendStreamingTTS({
 *   streamingId: '123',
 *   newText: '新增文本',
 *   isFinish: false
 * });
 * ```
 */
export declare const appendStreamingTTS: (params: {
    streamingId: string;
    newText: string;
    isFinish: boolean;
}) => Promise<object>;
/**
 * 取消流式TTS会话
 * @param params - 请求参数
 * @param params.streamingId - 要取消的流式会话ID
 * @example
 * ```ts
 * await cancelStreamingTTS({ streamingId: '123' });
 * ```
 */
export declare const cancelStreamingTTS: (params: {
    streamingId: string;
}) => Promise<object>;

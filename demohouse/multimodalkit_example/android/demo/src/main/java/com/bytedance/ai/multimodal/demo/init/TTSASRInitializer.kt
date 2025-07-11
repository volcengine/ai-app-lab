package com.bytedance.ai.multimodal.demo.init

import android.util.Log
import com.bytedance.ai.multimodal.asr.api.config.ASRConfig
import com.bytedance.ai.multimodal.asr.api.extension.enableASR
import com.bytedance.ai.multimodal.asr.impl.volcengine.AsrServiceWithVolcengine
import com.bytedance.ai.multimodal.common.MultimodalKit
import com.bytedance.ai.multimodal.demo.core.utils.SettingsPreference
import com.bytedance.ai.multimodal.tts.api.config.TTSConfig
import com.bytedance.ai.multimodal.tts.api.extension.enableTTS
import com.bytedance.ai.multimodal.tts.impl.volcengine.impl.VolcengineTTSServiceImpl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 基于火山引擎的离在线语音合成SDK/流式语音识别SDK封装
 * 详见：https://www.volcengine.com/docs/6561/79827
 */
object TTSASRInitializer {

    private const val TAG = "TTSASRInitializer"
    //region tts asr
    private const val SPEECH_URL = "wss://openspeech.bytedance.com"
    private const val DEFAULT_SAMPLE_RATE = 16000
    private const val FORMAT = "pcm"

    private var defaultSpeaker: String = "zh_female_tianmeixiaoyuan_moon_bigtts"
    private val speechRate: Int by lazy {
        SettingsPreference.getGlobalPreference().getInt("tts_speed", 15)
    }

    fun initTTSAndASR() {
        CoroutineScope(Dispatchers.IO).launch {
            val appId = DefaultConfig.APP_ID
            val token = DefaultConfig.requestSpeechToken()

            if (token == null) {
                Log.e(TAG, "Failed to get token, TTS/ASR initialization aborted.")
                return@launch
            }
            withContext(Dispatchers.Main) {
                MultimodalKit.enableTTS(VolcengineTTSServiceImpl(), TTSConfig(
                    /**
                     * 目前固定为 wss://openspeech.bytedance.com
                     */
                    url = SPEECH_URL,
                    appKeyFetcher = {
                        /**
                         * 请先到火山控制台申请 Appid 和 Token，申请方法参考
                         * https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F
                         */
                        appId
                    },
                    //固定为16000
                    sampleRate = DEFAULT_SAMPLE_RATE,
                    //默认音色
                    defaultSpeaker = defaultSpeaker,
                    //固定为PCM
                    format = FORMAT,
                    speechRate = speechRate,
                    isBigTTS = true, //isBigTTS(),
                    tokenFetcher = { "Jwt;${token}" }
                ))
                .enableASR(AsrServiceWithVolcengine(), ASRConfig(
                    /**
                     * 目前固定为 wss://openspeech.bytedance.com
                     */
                    url = SPEECH_URL,
                    appKeyFetcher = {
                        /**
                         * 请先到火山控制台申请 Appid 和 Token，申请方法参考
                         * https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F
                         * 配置 Token 时需要添加固定前缀 Bearer;。
                         */
                        appId
                    },
                    tokenFetcher = {
                        /**
                         * 请先到火山控制台申请 Appid 和 Token，申请方法参考
                         * https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F
                         * 配置 Token 时需要添加固定前缀 Bearer;。
                         */
                        "Jwt;${token}"
                    },
                    sampleRate = DEFAULT_SAMPLE_RATE
                ))
            }
        }
    }

    //endregion
}
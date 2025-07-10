package com.bytedance.ai.multimodal.shopping.base

import android.content.Context
import com.bytedance.ai.multimodal.shopping.core.utils.SettingsPreference
import com.bytedance.ai.multimodal.visual.realtime.IRealtimeService
import com.bytedance.ai.multimodal.visual.realtime.IVideoSource
import com.bytedance.ai.multimodal.visual.realtime.RealtimeServiceProvider
import com.bytedance.ai.multimodal.visual.realtime.RealtimeSpeaker
import com.bytedance.ai.multimodal.visual.realtime.StateListener
import com.bytedance.ai.multimodal.visual.realtime.local.LocalRealtimeServiceConfig
import com.bytedance.ai.multimodal.visual.realtime.local.createDefaultAsrProcessor
import com.bytedance.ai.multimodal.visual.realtime.local.createRealtimeService
import com.bytedance.ai.multimodal.visual.realtime.processor.AsrResultProcessor

class VisualAssistant(
    val context: Context,
    private val videoSource: IVideoSource,
    private val stateListener: StateListener
){
    companion object {
        // 启动Service
        fun startService(
            context: Context,
            source: IVideoSource,
            stateListener: StateListener
        ): VisualAssistant {
            return VisualAssistant(context, source, stateListener)
        }

        private fun getEosTimeout(): Int {
            return SettingsPreference.getGlobalPreference().getString("eos_timeout", "1000")
                ?.toIntOrNull() ?: 1000
        }
    }

    val clientRealtimeCore: IRealtimeService

    init {
        clientRealtimeCore = initWithLocalMode()
    }

    private fun initWithAsrResultProcessor(): AsrResultProcessor {
        return RealtimeServiceProvider.createDefaultAsrProcessor(
            ProcessorConfigProvider.newDefaultProcessorConfig(),
            videoSource
        )
    }

    /**
     * 本地模式，即ASR/TTS/LLM流程通过本地SDK完成
     */
    private fun initWithLocalMode(): IRealtimeService {
        val processor = initWithAsrResultProcessor()
        val serviceConfig = LocalRealtimeServiceConfig(
            context = context,
            videoSource = videoSource,
            alwaysForeground = false,
            autoStartAsr = true,
            asrResultProcessor = processor,
            realtimeSpeakerConfig = RealtimeSpeaker.RealtimeSpeakerConfig(
                autoReconnect = true,
                enableEos = true,
                eosTimeout = getEosTimeout()
            ),
            stateListener = stateListener
        )
        return RealtimeServiceProvider.createRealtimeService(serviceConfig)
    }
}



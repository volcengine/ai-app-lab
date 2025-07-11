package com.bytedance.ai.multimodal.teacher

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import com.bytedance.ai.multimodal.visual.realtime.videosource.FrameInterceptDelegate
import com.bytedance.ai.multimodal.visual.realtime.StateListener
import com.bytedance.ai.multimodal.visual.realtime.videosource.FrameInterceptDelegateConfig
import com.bytedance.ai.multimodal.teacher.base.VisualAssistant
import com.bytedance.ai.multimodal.teacher.core.utils.SettingsPreference

class CameraLiveWorkflow(application: Application) : AndroidViewModel(application) {

    private var assistant: VisualAssistant? = null

    var frameInterceptDelegate: FrameInterceptDelegate =
        FrameInterceptDelegate(true)

    fun startAssistant(context: Context, listener: StateListener) {
        assistant = VisualAssistant.startService(
            context, frameInterceptDelegate,
            listener
        )
    }

    fun releaseAssistant(context: Context) {
        assistant?.clientRealtimeCore?.release(context)
        assistant = null
        frameInterceptDelegate.stop()
        frameInterceptDelegate = FrameInterceptDelegate(true)
    }

    fun startListening() {
        assistant?.clientRealtimeCore?.startMic()
    }

    fun abortCurrentTask(stop: Boolean) {
        assistant?.clientRealtimeCore?.abortCurrentTask(stop)
    }

    fun resetFrameInterceptDelegate() {
        val frameInterval =
            SettingsPreference.getGlobalPreference().getString("frame_interval", null)
                ?.toIntOrNull()
        val frameIntervalSecond =
            SettingsPreference.getGlobalPreference().getInt("frame_interval_second", 2)

        val enableSimilarityFilter = SettingsPreference.getGlobalPreference()
            .getBoolean("enable_similarity_frame_filter", false)
        val similarityThreshold =
            SettingsPreference.getGlobalPreference().getString("similarity_threshold", "0.8")
                ?.toFloatOrNull() ?: 0.8f
        frameInterceptDelegate.setInterceptors(
            FrameInterceptDelegateConfig(
                frameInterval = frameInterval ?: (frameIntervalSecond * 1000),
                enableSimilarityFilter = enableSimilarityFilter,
                similarityThreshold = similarityThreshold
            )
        )
    }
}
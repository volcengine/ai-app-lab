package com.bytedance.ai.multimodal.teacher.init

import com.bytedance.ai.bridge.core.GlobalMethodSeeker
import com.bytedance.ai.multimodal.asr.bridge.MultiModalStartASRMethod
import com.bytedance.ai.multimodal.asr.bridge.MultiModalStopASRMethod
import com.bytedance.ai.multimodal.teacher.bridge.CloseMethod
import com.bytedance.ai.multimodal.teacher.bridge.GetQuestionSegmentListMethod
import com.bytedance.ai.multimodal.tts.bridge.MultiModalAppendStreamingTTSMethod
import com.bytedance.ai.multimodal.tts.bridge.MultiModalCancelStreamingTTSMethod
import com.bytedance.ai.multimodal.tts.bridge.MultiModalCancelTTSMethod
import com.bytedance.ai.multimodal.tts.bridge.MultiModalCreateStreamingTTSMethod
import com.bytedance.ai.multimodal.tts.bridge.MultiModalStartTTSMethod
import com.bytedance.ai.multimodal.visual.bridge.vision.GetImageInfoMethod
import com.bytedance.ai.multimodal.visual.bridge.vision.GetObjectDetectionMethod
import com.bytedance.ai.multimodal.visual.bridge.vision.GetSAMInfoMethod
import com.bytedance.ai.multimodal.vlm.bridge.CancelChatCompletionStreamingMethod
import com.bytedance.ai.multimodal.vlm.bridge.ChatCompletionMethod
import com.bytedance.ai.multimodal.vlm.bridge.ReadChatCompletionStreamingMethod
import com.bytedance.ai.multimodal.vlm.bridge.RequestChatCompletionStreamingMethod

object AIBridgeInitializer {

    fun init() {
        GlobalMethodSeeker.register(GetQuestionSegmentListMethod::class.java)
        GlobalMethodSeeker.register(CloseMethod::class.java)

        //image
        GlobalMethodSeeker.register(GetImageInfoMethod::class.java)
        GlobalMethodSeeker.register(GetObjectDetectionMethod::class.java)
        GlobalMethodSeeker.register(GetSAMInfoMethod::class.java)

        //asr tts
        GlobalMethodSeeker.register(MultiModalStartTTSMethod::class.java)
        GlobalMethodSeeker.register(MultiModalCancelTTSMethod::class.java)
        GlobalMethodSeeker.register(MultiModalStartASRMethod::class.java)
        GlobalMethodSeeker.register(MultiModalStopASRMethod::class.java)
        GlobalMethodSeeker.register(MultiModalCreateStreamingTTSMethod::class.java)
        GlobalMethodSeeker.register(MultiModalAppendStreamingTTSMethod::class.java)
        GlobalMethodSeeker.register(MultiModalCancelStreamingTTSMethod::class.java)

        //vlm
        GlobalMethodSeeker.register(ChatCompletionMethod::class.java)
        GlobalMethodSeeker.register(CancelChatCompletionStreamingMethod::class.java)
        GlobalMethodSeeker.register(RequestChatCompletionStreamingMethod::class.java)
        GlobalMethodSeeker.register(ReadChatCompletionStreamingMethod::class.java)
    }
}
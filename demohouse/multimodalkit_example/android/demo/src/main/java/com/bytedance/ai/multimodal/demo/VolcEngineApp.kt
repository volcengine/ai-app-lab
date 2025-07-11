package com.bytedance.ai.multimodal.demo

import android.app.Application
import android.webkit.WebView
import androidx.appcompat.app.AppCompatDelegate
import com.bytedance.ai.multimodal.algorithm.api.opencv.extension.enableOpenCV
import com.bytedance.ai.multimodal.algorithm.tob.opencv.OpenCVServiceImpl
import com.bytedance.ai.multimodal.common.IHostAbilities
import com.bytedance.ai.multimodal.common.IPermissionHandler
import com.bytedance.ai.multimodal.common.MultiModalKitConfig
import com.bytedance.ai.multimodal.common.MultimodalKit
import com.bytedance.ai.multimodal.common.log.ILogger
import com.bytedance.ai.multimodal.objectdetect.api.extension.enableObjectDetector
import com.bytedance.ai.multimodal.objectdetect.impl.rtdetr.RtdetrDetectorServiceImpl
import com.bytedance.ai.multimodal.segmentation.api.extension.enableSegmentation
import com.bytedance.ai.multimodal.segmentation.impl.mobile_sam.MobileSamServiceImpl
import com.bytedance.ai.multimodal.demo.core.permission.PermissionHandlerImpl
import com.bytedance.ai.multimodal.demo.core.utils.ActivityManager
import com.bytedance.ai.multimodal.demo.init.AIBridgeInitializer
import com.bytedance.ai.multimodal.demo.init.TTSASRInitializer
import com.bytedance.ai.multimodal.demo.init.VLMInitializer

class VolcEngineApp : Application() {

    companion object{
        private const val SAM_DECODE_MODEL_PATH = "mobile_sam_decoder.onnx"
        private const val SAM_ENCODER_MODEL_PATH = "mobile_sam_encoder.onnx"
        private const val RT_DETR_MODEL_PATH = "rt-detr_v2_s.onnx"
        private const val COCO_LABELS_PATH = "coco_labels.dat"
    }

    override fun onCreate() {
        super.onCreate()
        AppCore.inst = this
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)

        ActivityManager.init(this)
        initMultimodalKit()
        AIBridgeInitializer.init()
        if (AppCore.isLocalTestOrDebug()) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }

    private fun initMultimodalKit() {
        val config = MultiModalKitConfig.Builder(getHostAbility())
            .modelDownloader(ModelDownloader())
            .build()

        MultimodalKit.init(this, config)
            //启用opencv
            .enableOpenCV(OpenCVServiceImpl())
            //启用物体分割能力
            .enableSegmentation(
                MobileSamServiceImpl(
                    encoderModelName = SAM_ENCODER_MODEL_PATH,
                    decoderModelName = SAM_DECODE_MODEL_PATH
                )
            )
            //启用物体识别能力
            .enableObjectDetector(RtdetrDetectorServiceImpl(
                modelPath = RT_DETR_MODEL_PATH,
                labelListPath = COCO_LABELS_PATH))
        //初始化VLM能力
        VLMInitializer.initVLM()
        //初始化ASR和TTS能力
        TTSASRInitializer.initTTSAndASR()
    }

    /**
     * 实现宿主能力
     */
    private fun getHostAbility() = object : IHostAbilities {

        override fun getLogger(): ILogger {
            //日志实现
            return DefaultLogger
        }

        override fun getPermissionHandler(): IPermissionHandler {
            //权限申请
            return PermissionHandlerImpl
        }

        override fun getDeviceId(): String {
            //返回设备ID
            return "device_id"
        }

        override fun getAppVersionName(): String {
            //app版本号
            return BuildConfig.VERSION_NAME
        }
    }
}
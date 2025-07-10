package com.bytedance.ai.multimodal.shopping.vision

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.bytedance.ai.multimodal.shopping.vision.camera.FrameMetadata
import com.bytedance.ai.multimodal.shopping.vision.camera.FrameProcessor

class ImageAnalyzerDelegate(
    private val isFrontCamera: Boolean,
    var frameProcessor: FrameProcessor? = null
): ImageAnalysis.Analyzer {

    override fun analyze(image: ImageProxy) {
        val rotationDegrees: Int = image.imageInfo.rotationDegrees
        val frameMetadata = FrameMetadata(image.width, image.height, rotationDegrees, isFrontCamera)
        frameProcessor?.apply {
            process(image, frameMetadata)
        } ?: kotlin.run {
            image.close()
            return
        }
    }
}
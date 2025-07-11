package com.bytedance.ai.multimodal.demo.vision.camera

import androidx.camera.core.ImageProxy

/** An interface to process the input camera frame and perform detection on it.  */
interface FrameProcessor {

    /** Processes the input frame with the underlying detector.  */
    fun process(data: ImageProxy, frameMetadata: FrameMetadata)

    /** Stops the underlying detector and release resources.  */
    fun stop()

    fun pause()

    fun resume()
}
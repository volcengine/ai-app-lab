/*
 * Copyright 2021-2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.bytedance.ai.multimodal.teacher.vision.camera

import android.graphics.Bitmap
import androidx.annotation.GuardedBy
import androidx.camera.core.ImageInfo
import androidx.camera.core.ImageProxy
import com.bytedance.ai.multimodal.common.base.VisualImageObjectWithBitmap
import com.bytedance.ai.multimodal.common.log.FLogger
import com.bytedance.ai.multimodal.visual.realtime.videosource.FrameInterceptDelegate
import com.bytedance.ai.multimodal.teacher.vision.BitmapInputInfo
import com.bytedance.ai.multimodal.teacher.vision.InputInfo
import com.bytedance.ai.multimodal.teacher.core.utils.toBitmap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

/** Abstract base class of [FrameProcessor].  */
abstract class FrameProcessorBase<T> : FrameProcessor {

    // To keep the latest frame and its metadata.
    @GuardedBy("this")
    private var latestFrame: ImageProxy? = null

    @GuardedBy("this")
    private var latestFrameMetaData: FrameMetadata? = null

    // To keep the frame and metadata in process.
    @GuardedBy("this")
    private var processingFrame: ImageProxy? = null

    @GuardedBy("this")
    private var processingFrameMetaData: FrameMetadata? = null

    private var frameInterceptDelegate: FrameInterceptDelegate? = null

    private val frameProcessScope =
        CoroutineScope(Executors.newSingleThreadExecutor().asCoroutineDispatcher())

    private var isPaused = false

    @Synchronized
    override fun process(
        data: ImageProxy,
        frameMetadata: FrameMetadata,
    ) {
        latestFrame?.close()
        latestFrame = data
        latestFrameMetaData = frameMetadata
        if (processingFrame == null && processingFrameMetaData == null) {
            processLatestFrame()
        }
    }

    @Synchronized
    private fun processLatestFrame() {
        if (isPaused) {
            latestFrame?.close()
            latestFrame = null
            return
        }
        processingFrame = latestFrame
        processingFrameMetaData = latestFrameMetaData
        latestFrame = null
        latestFrameMetaData = null
        val frame = processingFrame ?: return

        val frameMetaData = processingFrameMetaData ?: return

        frameProcessScope.launch {
            val bitmap = frame.toBitmap(frameMetaData.isFrontCamera) ?: return@launch
            runCatching {
                frameInterceptDelegate?.onNewImage(VisualImageObjectWithBitmap(bitmap))
                detectInImage(bitmap, frame.imageInfo)
            }.onSuccess { results ->
                withContext(Dispatchers.Main) {
                    this@FrameProcessorBase.onSuccess(BitmapInputInfo(bitmap), results)
                }
                processLatestFrame()
            }.onFailure {e ->
                this@FrameProcessorBase.onFailure(e)
                frame.close()
                FLogger.w(TAG, "processLatestFrame failed", e)
            }
        }
    }

    override fun pause() {
        isPaused = true
    }

    override fun resume() {
        isPaused = false
        processLatestFrame()
    }

    override fun stop() {
        latestFrame?.close()
        latestFrame = null
        frameInterceptDelegate = null
    }

    fun bindImageCacheDelegate(consumer: FrameInterceptDelegate) {
        frameInterceptDelegate = consumer
    }

    protected abstract suspend fun detectInImage(image: Bitmap, imageInfo: ImageInfo): T

    /** Be called when the detection succeeds.  */
    protected abstract fun onSuccess(
        inputInfo: InputInfo,
        results: T
    )

    protected abstract fun onFailure(e: Throwable)

    companion object {
        private const val TAG = "FrameProcessorBase"
    }
}
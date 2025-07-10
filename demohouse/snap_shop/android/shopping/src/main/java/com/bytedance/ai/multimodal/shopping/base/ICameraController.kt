package com.bytedance.ai.multimodal.shopping.base

import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.view.PreviewView
import androidx.core.util.Consumer
import com.bytedance.ai.multimodal.visual.realtime.record.IVideoRecording
import com.bytedance.ai.multimodal.visual.realtime.record.RecordEvent
import com.bytedance.ai.multimodal.visual.realtime.record.VideoRecordOptions
import com.bytedance.ai.multimodal.shopping.vision.camera.FrameProcessorBase
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import kotlinx.coroutines.Deferred

data class CameraConfig(
    val targetResolution: ResolutionStrategy?,
    val aspectRatioStrategy: AspectRatioStrategy?,
    val targetScaleType: PreviewView.ScaleType = PreviewView.ScaleType.FILL_CENTER
)

interface ICameraController {
    fun imageCapture(saveToAlbum: Boolean = false): Deferred<BitMapWithPosition?>
    fun startRecording(options: VideoRecordOptions, listener: Consumer<RecordEvent>): IVideoRecording?
    fun stopCameraPreview()
    fun startCameraPreview(cameraConfig: CameraConfig?)
    fun pauseCameraPreview()
    fun resumeCameraPreview()
    fun toggleFlashlight(enable: Boolean)
    fun setZoomRatio(zoomRatio: Float)
    fun flipCamera()
    fun bindFrameProcessor(processor: FrameProcessorBase<*>)
    fun setPreviewViewLayout(width: Int, height: Int, left: Int, top: Int)
}
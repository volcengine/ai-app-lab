package com.bytedance.ai.multimodal.demo.view.fragments

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Outline
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.view.LayoutInflater
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import androidx.camera.core.AspectRatio
import androidx.camera.core.Camera
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.core.TorchState
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.core.resolutionselector.ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.constraintlayout.widget.ConstraintSet
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Observer
import com.bytedance.ai.multimodal.common.log.FLogger
import com.bytedance.ai.multimodal.common.utils.gone
import com.bytedance.ai.multimodal.common.utils.saveToAlbum
import com.bytedance.ai.multimodal.common.utils.visible
import com.bytedance.ai.multimodal.visual.realtime.record.IVideoRecording
import com.bytedance.ai.multimodal.visual.realtime.record.RecordEvent
import com.bytedance.ai.multimodal.visual.realtime.record.VideoRecordOptions
import com.bytedance.ai.multimodal.demo.base.CameraConfig
import com.bytedance.ai.multimodal.demo.base.ICameraController
import com.bytedance.ai.multimodal.demo.databinding.FragmentCameraPreviewBinding
import com.bytedance.ai.multimodal.demo.vision.ImageAnalyzerDelegate
import com.bytedance.ai.multimodal.demo.vision.camera.WorkflowModel
import com.bytedance.ai.multimodal.demo.core.utils.rotate
import com.bytedance.ai.multimodal.demo.vision.camera.FrameProcessor
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import com.hjq.permissions.Permission
import com.hjq.permissions.XXPermissions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import kotlin.math.abs

class CameraPreviewFragment: Fragment(), ICameraController {
    companion object {
        private const val TAG = "CameraPreviewFragment"
        private const val DEFAULT_ZOOM_RATIO = 1F
        const val ACCELEROMETER_THRESHOLD = 7
    }

    private var lastRecordRequest: Observer<WorkflowModel.CameraState>? = null
    private var currentRecording: Recording? = null

    private var showBlackFrame: Boolean = false

    private var imageAnalyzerDelegate: ImageAnalyzerDelegate? = null
    private lateinit var binding: FragmentCameraPreviewBinding
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var imageCapture: ImageCapture? = null
    private var camera: Camera? = null
    private var cameraControl: CameraControl? = null
    private var cameraProvider: ProcessCameraProvider? = null

    private lateinit var cameraExecutor: ExecutorService
    private var isFrontCamera = false

    private val workflowModel: WorkflowModel by activityViewModels()
    private var currentWorkflowState: WorkflowModel.WorkflowState? = null
    private var previewResolution: Size? = null
    private var curZoomRatio = DEFAULT_ZOOM_RATIO
    private var screenDirection = ScreenDirection.UP
    private var videoCapture: VideoCapture<Recorder>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setUpWorkflowModel()
        monitorScreenDirection()
    }

    private fun monitorScreenDirection() {
        val sensorManager =
            requireActivity().getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        sensorManager.registerListener(
            object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent?) {
                    if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
                        val x = event.values[0]
                        val y = event.values[1]
                        if (y > ACCELEROMETER_THRESHOLD && abs(y - x) > ACCELEROMETER_THRESHOLD && screenDirection != ScreenDirection.UP) {
                            screenDirection = ScreenDirection.UP
                            imageCapture?.targetRotation =
                                ScreenDirection.getRotation(screenDirection)
                        } else if (y < -ACCELEROMETER_THRESHOLD && abs(x - y) > ACCELEROMETER_THRESHOLD && screenDirection != ScreenDirection.DOWN) {
                            screenDirection = ScreenDirection.DOWN
                            imageCapture?.targetRotation =
                                ScreenDirection.getRotation(screenDirection)
                        } else if (x > ACCELEROMETER_THRESHOLD && abs(x - y) > ACCELEROMETER_THRESHOLD && screenDirection != ScreenDirection.LEFT) {
                            screenDirection = ScreenDirection.LEFT
                            imageCapture?.targetRotation =
                                ScreenDirection.getRotation(screenDirection)
                        } else if (x < -ACCELEROMETER_THRESHOLD && abs(x - y) > ACCELEROMETER_THRESHOLD && screenDirection != ScreenDirection.RIGHT) {
                            screenDirection = ScreenDirection.RIGHT
                            imageCapture?.targetRotation =
                                ScreenDirection.getRotation(screenDirection)
                        }
                    }
                }
                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
            },
            sensor,
            SensorManager.SENSOR_DELAY_NORMAL
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentCameraPreviewBinding.inflate(inflater)
        return binding.root
    }

    override fun startCameraPreview(cameraConfig: CameraConfig?) {
        val workflowModel = this.workflowModel
        val context = context ?: return
        if (!workflowModel.isCameraLive) {
            binding.cameraPreview.visible()
            binding.cameraPreview.outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, 20 * resources.displayMetrics.density)
                }
            }
            binding.cameraPreview.clipToOutline = true

            try {
                cameraExecutor = Executors.newSingleThreadExecutor()
                val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
                cameraProviderFuture.addListener({
                    if (isDetached || this.context == null) {
                        return@addListener
                    }
                    cameraProvider = cameraProviderFuture.get()
                    bindCameraUseCases(cameraConfig)
                    camera?.cameraControl?.setZoomRatio(1f)
                }, ContextCompat.getMainExecutor(context))
            } catch (e: IOException) {
                Log.e(TAG, "Failed to start camera preview!", e)
            }
        }
    }

    override fun pauseCameraPreview() {
        showBlackFrame = true
        imageAnalyzerDelegate?.frameProcessor?.pause()
    }

    override fun resumeCameraPreview() {
        showBlackFrame = false
        imageAnalyzerDelegate?.frameProcessor?.resume()
    }

    override fun toggleFlashlight(enable: Boolean) {
        camera?.apply {
            if (cameraInfo.hasFlashUnit()) {
                val isTorchOn = cameraInfo.torchState.value == TorchState.ON
                if (isTorchOn == enable) {
                    return
                }
                cameraControl.enableTorch(enable)
            } else {
                FLogger.d(TAG,"camera has no flash unit")
            }
        }
    }

    override fun setZoomRatio(zoomRatio: Float) {
        camera?.cameraControl?.setZoomRatio(zoomRatio)
        curZoomRatio = zoomRatio
    }

    override fun flipCamera() {
        isFrontCamera = !isFrontCamera
        if (workflowModel.cameraState.value is WorkflowModel.CameraState.ON_BIND) {
            stopCameraPreview()
            startCameraPreview(workflowModel.cameraConfig.value)
        }
    }

    override fun bindFrameProcessor(processor: FrameProcessor) {
        imageAnalyzerDelegate?.frameProcessor = processor
    }

    override fun setPreviewViewLayout(width: Int, height: Int, left: Int, top: Int) {
        Log.d(TAG, "setPreviewViewLayout() called with: width = $width, height = $height, left = $left, top = $top")

        val constraintLayout = binding.root
        val cameraPreview = binding.cameraPreview

        // 创建并应用新的 ConstraintSet
        val constraintSet = ConstraintSet()
        constraintSet.clone(constraintLayout)

        // 更新 cameraPreview 的宽高
        constraintSet.constrainWidth(cameraPreview.id, width)
        constraintSet.constrainHeight(cameraPreview.id, height)

        // 设置相对于父布局的边距 (left -> start, top -> top)
        constraintSet.connect(cameraPreview.id, ConstraintSet.START, ConstraintSet.PARENT_ID, ConstraintSet.START, left)
        constraintSet.connect(cameraPreview.id, ConstraintSet.TOP, ConstraintSet.PARENT_ID, ConstraintSet.TOP, top)

        // 应用修改
        constraintSet.applyTo(constraintLayout)
    }

    override fun stopCameraPreview() {
        if (workflowModel.isCameraLive) {
            workflowModel.markCameraFrozen()
            try {
                currentRecording?.stop()
                currentRecording = null
                cameraProvider?.unbindAll()
                preview?.setSurfaceProvider(null)
                cameraExecutor.shutdown()
            } catch (e: IOException) {
                Log.e(TAG, "Failed to stop camera preview!", e)
            }
            binding.cameraPreview.gone()
        }
    }

    private fun bindCameraUseCases(cameraConfig: CameraConfig?) {
        val cameraProvider =
            cameraProvider ?: throw IllegalStateException("Camera initialization failed.")
        val rotation = binding.cameraPreview.display?.rotation ?: Surface.ROTATION_0

        cameraProvider.unbindAll()

        val preferredResolution = cameraConfig?.targetResolution
            ?: ResolutionStrategy(Size(1280, 720), FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)

        //预期比例
        val aspectRatioStrategy = cameraConfig?.aspectRatioStrategy
            ?: AspectRatioStrategy(
                AspectRatio.RATIO_4_3,
                AspectRatioStrategy.FALLBACK_RULE_AUTO
            )

        // 构建 ResolutionSelector 分辨率策略
        val resolutionSelector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(aspectRatioStrategy) // 设置宽高比策略
            .setResolutionStrategy(preferredResolution) // 设置分辨率策略
            .build()

        val bitrate = 1280 * 720 * 4
        videoCapture = VideoCapture
            .withOutput(
                Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.HD))
                    .setTargetVideoEncodingBitRate(bitrate)
                    .build()
            )

        preview = Preview.Builder()
            .setResolutionSelector(resolutionSelector)
            .setTargetRotation(rotation)
            .build()

        imageAnalyzer = ImageAnalysis.Builder()
            .setResolutionSelector(resolutionSelector)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setTargetRotation(rotation)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()

        if (imageAnalyzerDelegate == null) {
            imageAnalyzerDelegate = ImageAnalyzerDelegate(isFrontCamera)
        }

        imageAnalyzer?.setAnalyzer(cameraExecutor, imageAnalyzerDelegate!!)

        imageCapture = ImageCapture.Builder()
            .setResolutionSelector(resolutionSelector)
            .setTargetRotation(rotation)
            .build()

        val useCaseGroup = UseCaseGroup.Builder()
            .addUseCase(preview!!)          // 添加预览 use case
            .addUseCase(imageAnalyzer!!)    // 添加图像分析 use case
            .addUseCase(imageCapture!!)     // 照相
            .addUseCase(videoCapture!!)     // 录像
            .build()

        try {
            val cameraSelector = CameraSelector
                .Builder()
                .requireLensFacing(if (isFrontCamera) CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK)
                .build()

            camera = cameraProvider.bindToLifecycle(
                this,
                cameraSelector,
                useCaseGroup
            )
            cameraControl = camera?.cameraControl

            preview?.setSurfaceProvider { request: SurfaceRequest ->
                previewResolution = request.resolution
                binding.cameraPreview.surfaceProvider.onSurfaceRequested(request)
            }
            workflowModel.markCameraLive(
                imageAnalyzer?.resolutionInfo?.resolution,
                binding.cameraPreview.scaleType,
                this
            )
        } catch (exc: Exception) {
            Log.e(TAG, "Use case binding failed", exc)
        }
    }

    private fun setUpWorkflowModel() {
        workflowModel.apply {
            cameraState.observe(this@CameraPreviewFragment){ state ->
                Log.d(TAG, "Current camera alive : $state")
                if (state is WorkflowModel.CameraState.ON_START) {
                    startCameraPreview(cameraConfig.value)
                } else if (state is WorkflowModel.CameraState.NOT_STARTED) {
                    stopCameraPreview()
                }
            }
        }
    }

    override fun imageCapture(saveToAlbum: Boolean) = CoroutineScope(
        Dispatchers.IO).async {
        val bitmap = suspendCoroutine { continuation ->
            imageCapture?.takePicture(
                cameraExecutor,
                object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(imageProxy: ImageProxy) {
                        val bitmap = imageProxy.toBitmap()
                            .rotate(imageProxy.imageInfo.rotationDegrees.toFloat())
                        continuation.resume(bitmap)
                    }

                    override fun onError(exception: ImageCaptureException) {
                        super.onError(exception)
                        Log.w(TAG, "capture image fail", exception)
                        continuation.resume(null)
                    }
                })
        }
        bitmap?.let {
            val uri = if (saveToAlbum) {
                context?.let { bitmap.saveToAlbum(it, null, null, null) }
            } else null
            BitMapWithPosition(bitmap, null, uri)
        }
    }

    override fun startRecording(options: VideoRecordOptions, listener: Consumer<RecordEvent>): IVideoRecording {
        val outputOptions = FileOutputOptions.Builder(File(options.savePath))
            .build()
        if (currentRecording != null) {
            currentRecording?.stop()
            currentRecording = null
        }
        lastRecordRequest?.let {
            workflowModel.cameraState.removeObserver(it)
        }
        workflowModel.cameraState.observe(this, object : Observer<WorkflowModel.CameraState> {
            override fun onChanged(state: WorkflowModel.CameraState) {
                if (state is WorkflowModel.CameraState.ON_BIND) {
                    workflowModel.cameraState.removeObserver(this)
                    currentRecording =
                        videoCapture?.output?.prepareRecording(requireContext(), outputOptions)?.apply {
                            if (options.enableAudio && XXPermissions.isGranted(requireContext(), Permission.RECORD_AUDIO)) {
                                if (ActivityCompat.checkSelfPermission(requireContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                    Log.i(TAG, "no audio record permission")
                                    return
                                }
                                this.withAudioEnabled()
                            }
                        }?.start(ContextCompat.getMainExecutor(requireContext())) { event ->
                            when (event) {
                                is VideoRecordEvent.Start -> {
                                    FLogger.d(TAG, "Video record start: ${options.savePath}")
                                    listener.accept(RecordEvent.Start)
                                }

                                is VideoRecordEvent.Finalize -> {
                                    if (event.error == VideoRecordEvent.Finalize.ERROR_NONE) {
                                        FLogger.d(TAG, "Video saved: ${options.savePath}")
                                        listener.accept(RecordEvent.Success)
                                    } else {
                                        FLogger.e(TAG, "Recording error: ${event.error}")
                                        listener.accept(RecordEvent.Error(event.error, event.cause))
                                    }
                                }
                            }
                        }
                }
            }
        }.also { lastRecordRequest = it } )

        return object : IVideoRecording {
            override fun pause() {
                currentRecording?.pause()
            }

            override fun resume() {
                currentRecording?.resume()
            }

            override fun stop() {
                currentRecording?.stop()
                currentRecording = null
            }

            override fun mute(muted: Boolean) {
                currentRecording?.mute(muted)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        currentWorkflowState = WorkflowModel.WorkflowState.NOT_STARTED
        workflowModel.markCameraFrozen()
        if (XXPermissions.isGranted(requireContext(), Permission.CAMERA)) {
            workflowModel.cameraState.value = WorkflowModel.CameraState.ON_START
        }
    }

    override fun onPause() {
        super.onPause()
        currentWorkflowState = WorkflowModel.WorkflowState.NOT_STARTED
        stopCameraPreview()
    }

}

enum class ScreenDirection {
    RIGHT,
    UP,
    DOWN,
    LEFT;

    companion object {
        fun getRotation(direction: ScreenDirection): Int {
            return when (direction) {
                UP -> Surface.ROTATION_0
                LEFT -> Surface.ROTATION_90
                RIGHT -> Surface.ROTATION_270
                DOWN -> Surface.ROTATION_180
            }
        }
    }
}
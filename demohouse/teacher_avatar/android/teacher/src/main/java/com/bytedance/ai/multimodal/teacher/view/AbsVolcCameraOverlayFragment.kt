package com.bytedance.ai.multimodal.teacher.view

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.view.PreviewView
import androidx.fragment.app.activityViewModels
import com.bytedance.ai.multimodal.teacher.base.CameraConfig
import com.bytedance.ai.multimodal.teacher.base.ICameraController
import com.bytedance.ai.multimodal.common.utils.UnitUtils.dp2px
import com.bytedance.ai.multimodal.teacher.databinding.CameraPreviewOverlayBinding
import com.bytedance.ai.multimodal.teacher.databinding.FragmentVolcengineCameraBinding
import com.bytedance.ai.multimodal.teacher.view.popup.base.AbsOverlayFragment
import com.bytedance.ai.multimodal.teacher.vision.camera.GraphicOverlay
import com.bytedance.ai.multimodal.teacher.vision.camera.WorkflowModel
import com.bytedance.ai.multimodal.tts.api.TTSService
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import com.gyf.immersionbar.ImmersionBar
import kotlinx.coroutines.Deferred

abstract class AbsVolcCameraOverlayFragment : AbsOverlayFragment() {

    companion object {
        private const val TAG = "AbsVolcCameraOverlayFra"
    }

    protected lateinit var overlayGraph: GraphicOverlay

    protected lateinit var binding: FragmentVolcengineCameraBinding

    protected var cameraController: ICameraController? = null

    protected val workflowModel: WorkflowModel by activityViewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        workflowModel.cameraConfig.value = CameraConfig(
            targetResolution = null,
            aspectRatioStrategy = AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentVolcengineCameraBinding.inflate(inflater)
        overlayGraph = CameraPreviewOverlayBinding.bind(binding.root).cameraPreviewGraphicOverlay
        binding.tvTitle.text = getTitle()
        binding.tvTitle.setShadowLayer(1.dp2px().toFloat(), 0f, 1.dp2px().toFloat(), Color.parseColor("#88182333"))
        lifecycle.addObserver(binding.permissionRequestView)

        binding.tabTextSolve.isSelected = true
        binding.tabTextLive.setOnClickListener {
            binding.tabTextLive.isSelected = true
            binding.tabTextSolve.isSelected = false
            binding.tabTextCorrection.isSelected = false
            onCameraModeChange(getCameraModeSet()[0], 0)
        }
        binding.tabTextSolve.setOnClickListener {
            binding.tabTextLive.isSelected = false
            binding.tabTextSolve.isSelected = true
            binding.tabTextCorrection.isSelected = false
            onCameraModeChange(getCameraModeSet()[1], 1)
            TTSService.Companion.getInstance().stop()
        }
        binding.tabTextCorrection.setOnClickListener {
            binding.tabTextLive.isSelected = false
            binding.tabTextSolve.isSelected = false
            binding.tabTextCorrection.isSelected = true
            onCameraModeChange(getCameraModeSet()[2], 2)
            TTSService.Companion.getInstance().stop()
        }

        workflowModel.apply {
            // Observes the workflow state changes, if happens, update the overlay view indicators and
            // camera preview state.
            cameraState.observe(viewLifecycleOwner) {newState ->
                when (newState) {
                    is WorkflowModel.CameraState.ON_BIND -> {
                        newState.resolution?.apply {
                            overlayGraph.setCameraInfo(this)
                        }
                        newState.scaleType.apply {
                            overlayGraph.setScaleType(this == PreviewView.ScaleType.FIT_CENTER)
                        }
                        cameraController = newState.cameraController
                    }

                    is WorkflowModel.CameraState.NOT_STARTED -> {
                        cameraController = null
                    }
                    else->{}
                }
            }
        }
        return binding.root
    }

    fun getEmptyGuideLayoutContainer(): ViewGroup {
        val viewGroup = binding.layoutGuideContainer
        viewGroup.removeAllViews()
        return viewGroup
    }

    fun getEmptyCameraControlContainer(): ViewGroup {
        val viewGroup = binding.layoutControllerContainer
        viewGroup.removeAllViews()
        return viewGroup
    }

    override fun getCameraOverlayView(): View {
        return binding.cameraPreview
    }

    protected fun imageCapture(): Deferred<BitMapWithPosition?>? {
        return cameraController?.imageCapture(false)
    }

    protected fun toggleFlashlight(enable: Boolean) {
        cameraController?.toggleFlashlight(enable)
    }

    fun getCurrentCameraMode(): Pair<String, String> {
        return getCameraModeSet()[getCurrentCameraModeIndex()]
    }


    abstract fun onCameraModeChange(data: Pair<String, String>, position: Int)

    abstract fun getCurrentCameraModeIndex(): Int

    abstract fun getCameraModeSet(): List<Pair<String, String>>

    abstract fun getTitle(): String

    abstract fun getPrimaryColor(): Int

    override fun onResume() {
        super.onResume()
        ImmersionBar.with(this).titleBar(binding.toolbarContainer).init()
    }
}
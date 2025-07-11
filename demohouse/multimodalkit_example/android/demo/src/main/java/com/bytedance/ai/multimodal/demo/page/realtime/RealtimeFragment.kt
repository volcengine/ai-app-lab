package com.bytedance.ai.multimodal.demo.page.realtime

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.camera.view.PreviewView
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Observer
import com.bytedance.ai.multimodal.demo.base.ICameraController
import com.bytedance.ai.multimodal.demo.databinding.CameraPreviewOverlayBinding
import com.bytedance.ai.multimodal.demo.databinding.FragmentRealtimeBinding
import com.bytedance.ai.multimodal.demo.view.popup.base.AbsOverlayFragment
import com.bytedance.ai.multimodal.demo.view.popup.base.PopupCallback
import com.bytedance.ai.multimodal.demo.vision.camera.WorkflowModel
import com.bytedance.ai.multimodal.demo.vision.camera.WorkflowModel.WorkflowState
import com.bytedance.ai.multimodal.visual.realtime.videosource.FrameInterceptDelegate
import kotlinx.coroutines.Job
import com.gyf.immersionbar.ImmersionBar
import com.bytedance.ai.multimodal.demo.vision.objectdetection.DefaultProcessor

/**
 * 实时音视频通话-本地方案
 */
class RealtimeFragment(private val frameInterceptDelegate: FrameInterceptDelegate) : AbsOverlayFragment() {
    companion object {
        private const val TAG = "RealtimeFragment"
    }
    private lateinit var overlayBinding: CameraPreviewOverlayBinding
    private lateinit var binding: FragmentRealtimeBinding

    private var currentWorkflowState: WorkflowState? = null
    private val workflowModel: WorkflowModel by activityViewModels()
    private var cameraController: ICameraController? = null
    private var observeNewImageJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setUpWorkflowModel()
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        if (cameraViewModel.popupCallbackLiveData.value == null) {
            cameraViewModel.popupCallbackLiveData.value = object : PopupCallback() {
                override fun onInit(peekHeight: Int) {
                    binding.guidelineBottom.setGuidelineEnd(peekHeight)
                }
                override fun onSlide(bottomSheet: View, slideOffset: Float) {
                    val parentHeight = (bottomSheet.parent as View).height
                    val marginBottom = parentHeight - bottomSheet.y
                    binding.guidelineBottom.setGuidelineEnd(marginBottom.toInt())
                }
            }
        }
    }

    override fun getCameraOverlayView(): View {
        return binding.cameraPreviewContainer
    }

    override fun onDestroy() {
        super.onDestroy()
        observeNewImageJob?.cancel()
        observeNewImageJob = null
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentRealtimeBinding.inflate(inflater)
        overlayBinding = CameraPreviewOverlayBinding.bind(binding.root)
        binding.btnFlip.setOnClickListener {
            cameraController?.flipCamera()
        }
        lifecycle.addObserver(binding.permissionRequestView)
        return binding.root
    }

    override fun onResume() {
        super.onResume()
        runCatching {
            ImmersionBar.with(this)
                .titleBar(binding.toolbar.toolbarContainer)
                .init()
        }
    }

    private fun setUpWorkflowModel() {
        workflowModel.apply {
            cameraState.observe(this@RealtimeFragment) { newState ->
                when (newState) {
                    is WorkflowModel.CameraState.ON_BIND -> {
                        newState.resolution?.apply {
                            overlayBinding.cameraPreviewGraphicOverlay.setCameraInfo(this)
                        }
                        newState.scaleType.apply {
                            overlayBinding.cameraPreviewGraphicOverlay.setScaleType(this == PreviewView.ScaleType.FIT_CENTER)
                        }
                        this@RealtimeFragment.cameraController = newState.cameraController

                        workflowModel.let {
                            val processor =
                                DefaultProcessor(it)
                            processor.bindImageCacheDelegate(frameInterceptDelegate)
                            cameraController?.bindFrameProcessor(processor)
                        }
                    }

                    else -> {}
                }
            }

            workflowState.observe(this@RealtimeFragment, Observer { workflowState ->
                if (workflowState == null || currentWorkflowState == workflowState) {
                    return@Observer
                }
                currentWorkflowState = workflowState
                Log.d(TAG, "Current workflow state: ${workflowState.name}")
            })
        }
    }
}
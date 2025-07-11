package com.bytedance.ai.multimodal.demo.view.popup.base

import android.os.Bundle
import android.view.View
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import com.bytedance.ai.multimodal.demo.base.ICameraController
import com.bytedance.ai.multimodal.demo.page.realtime.CameraViewModel
import com.bytedance.ai.multimodal.demo.vision.camera.WorkflowModel

/**
 * 相机界面的overlay fragment，需要和CameraContainerFragment配合使用
 */
abstract class AbsOverlayFragment: Fragment() {

    private var lastTop: Int? = null
    private var lastLeft: Int? = null
    private var lastHeight: Int? = null
    private var lastWidth: Int? = null
    private var cameraController: ICameraController? = null
    private val cameraWorkflowModel: WorkflowModel by activityViewModels()
    protected val cameraViewModel: CameraViewModel by activityViewModels()

    open fun isCameraPreviewEnable(): Boolean = true

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        cameraWorkflowModel.cameraState.observe(viewLifecycleOwner) { state ->
            when (state) {
                is WorkflowModel.CameraState.ON_BIND -> {
                    this.cameraController = state.cameraController
                    if (lastWidth != null && lastHeight != null && lastLeft != null && lastTop != null) {
                        cameraController?.setPreviewViewLayout(lastWidth!!, lastHeight!!, lastLeft!!, lastTop!!)
                    }
                }
                else -> {}
            }
        }
        val cameraStubView = getCameraOverlayView()
        cameraStubView.addOnLayoutChangeListener { v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            // 更新 overlayView 的位置和大小
            cameraController?.setPreviewViewLayout(cameraStubView.width, cameraStubView.height, left, top)
            lastWidth = cameraStubView.width
            lastHeight = cameraStubView.height
            lastLeft = left
            lastTop = top
        }
    }

    /**
     * 返回相机preview view的overlay view，会和preview view 1:1 对应大小和位置
     */
    abstract fun getCameraOverlayView(): View
}
package com.bytedance.ai.multimodal.demo.vision.camera

import android.app.Application
import android.util.Size
import androidx.camera.view.PreviewView
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import com.bytedance.ai.multimodal.demo.base.CameraConfig
import com.bytedance.ai.multimodal.demo.base.ICameraController

/** View model for handling application workflow based on camera preview.  */
class WorkflowModel(application: Application) : AndroidViewModel(application) {

    private val TAG = "WorkflowModel"

    val cameraState = MutableLiveData<CameraState>()

    val cameraConfig = MutableLiveData<CameraConfig>()

    val workflowState = MutableLiveData<WorkflowState>()

    var isCameraLive = false
        private set

    /**
     * State set of the application workflow.
     */
    enum class WorkflowState {
        NOT_STARTED,
    }


    sealed class CameraState {
        class NOT_STARTED: CameraState()//未启动
        object ON_START: CameraState()//启动中
        class ON_BIND(
            val cameraController: ICameraController?,
            val resolution: Size?,
            val scaleType: PreviewView.ScaleType
        ): CameraState()//运行中
    }

    fun markCameraLive(resolution: Size?, scaleType: PreviewView.ScaleType, cameraController: ICameraController?) {
        isCameraLive = true
        cameraState.value = CameraState.ON_BIND(cameraController, resolution, scaleType)
    }

    fun markCameraFrozen() {
        isCameraLive = false
        cameraState.value = CameraState.NOT_STARTED()
    }

}
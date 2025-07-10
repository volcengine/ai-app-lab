package com.bytedance.ai.multimodal.shopping.vision.camera

import android.app.Application
import android.util.Size
import androidx.camera.view.PreviewView
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import com.bytedance.ai.multimodal.shopping.base.CameraConfig
import com.bytedance.ai.multimodal.shopping.base.ICameraController

class WorkflowModel(application: Application) : AndroidViewModel(application) {

    val cameraState = MutableLiveData<CameraState>()

    val cameraConfig = MutableLiveData<CameraConfig>()

    val userGuideMaskStatus = MutableLiveData<UserGuideMaskState>()

    var isCameraLive = false
        private set

    class UserGuideMaskState (
        val isShowing: Boolean = false,
        val mode: Int = 0
    )

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
package com.bytedance.ai.multimodal.demo.vision.objectdetection

import android.graphics.Bitmap
import android.util.Log
import androidx.camera.core.ImageInfo
import androidx.lifecycle.Observer
import com.bytedance.ai.multimodal.demo.vision.InputInfo
import com.bytedance.ai.multimodal.demo.vision.camera.FrameProcessorBase
import com.bytedance.ai.multimodal.demo.vision.camera.WorkflowModel
import com.bytedance.ai.multimodal.objectdetect.api.BoundingBox

class DefaultProcessor (
    private val workflowModel: WorkflowModel
) : FrameProcessorBase<List<BoundingBox>>(), Observer<WorkflowModel.WorkflowState> {

    init {
        workflowModel.workflowState.observeForever(this)
    }

    override fun stop() {
        super.stop()
        workflowModel.workflowState.removeObserver(this)
    }

    override suspend fun detectInImage(image: Bitmap, imageInfo: ImageInfo): List<BoundingBox> {
        return emptyList()
    }

    override fun onSuccess(
        inputInfo: InputInfo,
        results: List<BoundingBox>
    ) {
        Log.d(TAG, "Object detection onSuccess")
    }

    override fun onFailure(e: Throwable) {
        Log.w(TAG, "Object detection failed!", e)
    }

    override fun onChanged(value: WorkflowModel.WorkflowState) {

    }

    companion object Companion {
        private const val TAG = "DefaultProcessor"
    }

}

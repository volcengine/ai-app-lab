package com.bytedance.ai.multimodal.teacher.bridge

import android.app.AlertDialog
import android.os.Handler
import android.os.Looper
import com.bytedance.ai.bridge.context.IAIBridgeContext
import com.bytedance.ai.bridge.core.CompletionBlock
import com.bytedance.ai.multimodal.teacher.core.utils.ActivityManager

/**
 *  火山教师分身切题JSB
 */
class GetQuestionSegmentListMethod : AbsGetQuestionSegmentListMethodIDL() {

    companion object {
        private val TAG = "GetQuestionSegmentList"
    }

    override fun handle(
        bridgeContext: IAIBridgeContext,
        params: QuestionSegParamModel,
        callback: CompletionBlock<QuestionSegResultModel>
    ) {
        //切题 SDK 暂无实现，需寻找替代方案
        Handler(Looper.getMainLooper()).post {
            AlertDialog.Builder(ActivityManager.currentActivity)
                .setTitle("提示")
                .setMessage("切题功能功能需要手动实现，请查阅GetQuestionSegmentListMethod")
                .setPositiveButton("好的", null)
                .show()
        }
        callback.onFailure("Not implemented")
//        CoroutineScope(Dispatchers.IO).launch {
//            val image = ImageTaskQueue.obtain(params.imageId)
//            if (image == null) {
//                callback.onFailure("image is null")
//                return@launch
//            }
//            if (params.rotate != null) {
//                //只支持0、90、180、270
//                if (params.rotate!= 0 && params.rotate!= 90 && params.rotate!= 180 && params.rotate!= 270) {
//                    callback.onFailure("unsupported rotate value")
//                    return@launch
//                }
//            }
//            val rotate = params.rotate
//            val selectRect: Rect? = params.selectRect?.let {
//                Rect().apply {
//                    top = it.top
//                    bottom = it.bottom
//                    left = it.left
//                    right = it.right
//                }
//            }
//            FLogger.i(TAG, "selectRect=$selectRect")
//            image.eduQuestionRecognize(rotate, selectRect).onSuccess {
//                callback.onSuccess(QuestionSegResultModel::class.java.createModel().apply {
//                    FLogger.i(TAG, "onSuccess pass=${it.pass} status=${it.status}")
//                    this.pass = it.pass
//                    this.status = it.status
//                    this.midBoxIndex = it.midBoxIndex
//                    this.detectedQuestions = it.question?.map { question: Question ->
//                        val detectedQuestion = DetectedQuestion(
//                            question.questionImage.toBase64(),
//                            question.cornerPoints?.map { point ->
//                                Point(point.x, point.y)
//                            },
//                            question.boundingBox?.let {
//                                BoundingBox(
//                                    it.width(),
//                                    it.height(),
//                                    it.centerX(),
//                                    it.centerY(),
//                                    it.left,
//                                    it.top,
//                                    it.right,
//                                    it.bottom
//                                )
//                            }
//                        )
//                        FLogger.i(TAG, "detectedQuestion boundingBox=${detectedQuestion.boundingBox} cornerPoints=${detectedQuestion.cornerPoints}")
//                        detectedQuestion
//                    }
//                })
//            }.onFailure { e ->
//                FLogger.e(TAG, "api: $name question segment failed: ${e.message}")
//                callback.onFailure(e.message ?: "")
//            }
//        }
    }

}
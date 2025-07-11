package com.bytedance.ai.multimodal.teacher.bridge

import androidx.annotation.Keep
import com.bytedance.ai.bridge.core.CoreAIBridgeMethod
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamField
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamModel
import com.bytedance.ai.bridge.core.annotation.AIBridgeResultModel
import com.bytedance.ai.bridge.core.model.idl.ParamModel
import com.bytedance.ai.bridge.core.model.idl.ResultModel

abstract class AbsGetQuestionSegmentListMethodIDL:CoreAIBridgeMethod<AbsGetQuestionSegmentListMethodIDL.QuestionSegParamModel,AbsGetQuestionSegmentListMethodIDL.QuestionSegResultModel>() {
    override val name: String="mind.getQuestionSegmentList"


    @AIBridgeParamModel
    interface QuestionSegParamModel : ParamModel {
        @get:AIBridgeParamField(required = true, keyPath = "imageId")
        var imageId: String

        @get:AIBridgeParamField(required = false, keyPath = "rotate")
        var rotate: Int?

        @get:AIBridgeParamField(required = false, keyPath = "selectRect")
        var selectRect: SelectRect?

    }

    @AIBridgeResultModel
    interface QuestionSegResultModel : ResultModel {
        @set:AIBridgeParamField(required = true, keyPath = "pass")
        var pass: Boolean

        @set:AIBridgeParamField(required = true, keyPath = "status")
        var status: Int

        @set:AIBridgeParamField(required = false, keyPath = "midBoxIndex")
        var midBoxIndex: Int?

        @set:AIBridgeParamField(required = false, keyPath = "detectedQuestions")
        var detectedQuestions: List<DetectedQuestion>?
    }

    @Keep
    data class DetectedQuestion(
        val questionImage: String,
        val cornerPoints: List<Point>?,
        val boundingBox: BoundingBox?
    )

    @Keep
    data class BoundingBox(
        val width: Int,
        val height: Int,
        val centerX: Int,
        val centerY: Int,
        val left: Int,
        val top: Int,
        val right: Int,
        val bottom: Int
    )

    @Keep
    data class Point(
        val x: Int,
        val y: Int
    )


    @Keep
    data class SelectRect(
        val left: Int,
        val top: Int,
        val right: Int,
        val bottom: Int
    )


}
package com.bytedance.ai.multimodal.demo.bridge

import com.bytedance.ai.bridge.core.CoreAIBridgeMethod
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamField
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamModel
import com.bytedance.ai.bridge.core.annotation.AIBridgeResultModel
import com.bytedance.ai.bridge.core.model.idl.ParamModel
import com.bytedance.ai.bridge.core.model.idl.ResultModel

abstract class AbsGenerateMd5MethodIDL: CoreAIBridgeMethod<AbsGenerateMd5MethodIDL.GenerateMd5ParamModel, AbsGenerateMd5MethodIDL.GenerateMd5ResultModel>() {

    @AIBridgeParamModel
    interface GenerateMd5ParamModel : ParamModel{
        @get:AIBridgeParamField(required = true, keyPath = "content")
        var content: String?

    }
    @AIBridgeResultModel
    interface GenerateMd5ResultModel : ResultModel {
        @set:AIBridgeParamField(required = true, keyPath = "md5")
        var md5: String

    }

    override val name: String="app.generateMd5"
}
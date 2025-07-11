package com.bytedance.ai.multimodal.demo.bridge

import com.bytedance.ai.bridge.core.CoreAIBridgeMethod
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamModel
import com.bytedance.ai.bridge.core.annotation.AIBridgeResultModel
import com.bytedance.ai.bridge.core.model.idl.ParamModel
import com.bytedance.ai.bridge.core.model.idl.ResultModel

abstract class AbsCloseMethodIDL:CoreAIBridgeMethod<AbsCloseMethodIDL.CloseParamModel, AbsCloseMethodIDL.CloseResultModel>() {

    @AIBridgeParamModel
    interface CloseParamModel : ParamModel

    @AIBridgeResultModel
    interface CloseResultModel : ResultModel

    override val name: String = "app.close"
}
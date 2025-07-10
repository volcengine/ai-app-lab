package com.bytedance.ai.multimodal.shopping.bridge

import com.bytedance.ai.bridge.core.CoreAIBridgeMethod
import com.bytedance.ai.bridge.core.annotation.AIBridgeDefaultValue
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamField
import com.bytedance.ai.bridge.core.annotation.AIBridgeParamModel
import com.bytedance.ai.bridge.core.annotation.AIBridgeResultModel
import com.bytedance.ai.bridge.core.annotation.DefaultType
import com.bytedance.ai.bridge.core.model.idl.ParamModel
import com.bytedance.ai.bridge.core.model.idl.ResultModel

abstract class AbsTriggerVibrateMethodIDL :
    CoreAIBridgeMethod<AbsTriggerVibrateMethodIDL.TriggerVibrateParamModel, AbsTriggerVibrateMethodIDL.TriggerVibrateResultModel>() {

    override val name: String = "app.triggerVibration"


    @AIBridgeParamModel
    interface TriggerVibrateParamModel : ParamModel {
        @get:AIBridgeParamField(required = false, keyPath = "style", AIBridgeDefaultValue(DefaultType.STRING, stringValue = "medium"))
        var style: String
    }

    @AIBridgeResultModel
    interface TriggerVibrateResultModel : ResultModel
}
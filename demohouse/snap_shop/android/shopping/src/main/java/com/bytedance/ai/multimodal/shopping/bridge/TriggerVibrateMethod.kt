package com.bytedance.ai.multimodal.shopping.bridge

import com.bytedance.ai.bridge.context.IAIBridgeContext
import com.bytedance.ai.bridge.core.CompletionBlock
import com.bytedance.ai.bridge.core.utils.createModel
import com.bytedance.ai.multimodal.common.utils.VibrateUtil


class TriggerVibrateMethod : AbsTriggerVibrateMethodIDL() {

    override fun handle(bridgeContext: IAIBridgeContext, params: TriggerVibrateParamModel, callback: CompletionBlock<TriggerVibrateResultModel>) {
        when (params.style) {
            "light" -> {
                VibrateUtil.vibrate(64)
            }
            "medium" -> {
                VibrateUtil.vibrate(128)
            }
            "heavy" -> {
                VibrateUtil.vibrate(192)
            }
            else -> {}
        }
        callback.onSuccess(TriggerVibrateResultModel::class.java.createModel())
    }
}
package com.bytedance.ai.multimodal.demo.bridge

import com.bytedance.ai.bridge.context.IAIBridgeContext
import com.bytedance.ai.bridge.core.CompletionBlock
import com.bytedance.ai.bridge.core.utils.createModel
import com.bytedance.ai.multimodal.common.log.FLogger
import com.bytedance.ai.multimodal.common.utils.toMD5

class GenerateMd5Method: AbsGenerateMd5MethodIDL() {
    override fun handle(
        bridgeContext: IAIBridgeContext,
        params: GenerateMd5ParamModel,
        callback: CompletionBlock<GenerateMd5ResultModel>
    ) {
        val input = params.content
        FLogger.d("GenerateMd5Method", "input: $input")
        if (input.isNullOrEmpty()) {
            callback.onSuccess(GenerateMd5ResultModel::class.java.createModel().apply {
                md5 = ""
            })
        } else {
            val md5 = input.toMD5()
            FLogger.d("GenerateMd5Method", "md5: $md5")
            callback.onSuccess(GenerateMd5ResultModel::class.java.createModel().apply {
                this.md5 = md5
            })
        }
    }
}
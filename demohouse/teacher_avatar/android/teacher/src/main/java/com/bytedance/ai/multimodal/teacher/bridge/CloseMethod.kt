package com.bytedance.ai.multimodal.teacher.bridge

import com.bytedance.ai.bridge.context.IAIBridgeContext
import com.bytedance.ai.bridge.core.CompletionBlock
import com.bytedance.ai.bridge.core.utils.createModel
import com.bytedance.ai.multimodal.teacher.core.utils.ActivityManager
import com.bytedance.ai.multimodal.teacher.page.hybrid.web.MultimodalWebActivity

class CloseMethod : AbsCloseMethodIDL() {

    override fun handle(
        bridgeContext: IAIBridgeContext,
        params: CloseParamModel,
        callback: CompletionBlock<CloseResultModel>
    ) {
        if (ActivityManager.currentActivity !is MultimodalWebActivity) {
            callback.onFailure("current activity is not MultimodalWebActivity")
        }
        ActivityManager.finishFirstTopActivity(MultimodalWebActivity::class.java)
        callback.onSuccess(CloseResultModel::class.java.createModel())
    }
}
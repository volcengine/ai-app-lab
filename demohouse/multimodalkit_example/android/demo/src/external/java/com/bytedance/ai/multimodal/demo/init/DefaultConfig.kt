package com.bytedance.ai.multimodal.demo.init

import com.bytedance.ai.multimodal.common.utils.ToastUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object DefaultConfig {

    const val APP_ID: String = "YOUR_APP_ID"
    const val ARK_ENDPOINT = "YOUR_ENDPOINT"

    suspend fun requestSpeechToken(): String? = withContext(Dispatchers.IO) {
        ToastUtil.showToast("请在DefaultConfig中配置APP_ID和Token")
        return@withContext ""
    }

    fun requestVlmApiKey(): String? {
        ToastUtil.showToast("请在DefaultConfig中配置APP_ID和Token")
        return null
    }

}
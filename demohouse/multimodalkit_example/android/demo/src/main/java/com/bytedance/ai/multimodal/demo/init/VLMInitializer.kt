package com.bytedance.ai.multimodal.demo.init

import com.bytedance.ai.multimodal.common.MultimodalKit
import com.bytedance.ai.multimodal.common.utils.ToastUtil
import com.bytedance.ai.multimodal.demo.core.utils.SettingsPreference
import com.bytedance.ai.multimodal.vlm.api.ext.initGlobalVLM
import com.bytedance.ai.multimodal.vlm.impl.ark.VLMArkConfig
import com.bytedance.ai.multimodal.vlm.impl.ark.VLMArkService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 基于火山引擎的豆包大模型接口封装
 * 详见：https://www.volcengine.com/docs/82379/1541594
 */
object VLMInitializer {

    private const val ARK_HOST = "https://ark.cn-beijing.volces.com"

    //region vlm
    fun initVLM() {
        CoroutineScope(Dispatchers.IO).launch {
            val config = requestEndPointAndApiKey()
            if (config != null) {
                initVlmService(config.first, config.second)
            } else {
                // 处理获取失败的情况
                ToastUtil.showToast("获取API Key失败")
            }
        }
    }

    suspend fun requestEndPointAndApiKey(): Pair<String, String>? {
        val endpoint = DefaultConfig.ARK_ENDPOINT
        val apiKey = DefaultConfig.requestVlmApiKey()
        if (apiKey == null) {
            return null
        }
        return endpoint to apiKey
    }

    private fun initVlmService(endpoint: String, apiKey: String) {
        val compressSize =
            SettingsPreference.getGlobalPreference().getString("default_frame_size", null)
                ?.toIntOrNull() ?: -1
        MultimodalKit.initGlobalVLM(
            VLMArkService(),
            VLMArkConfig(
                //获取Endpoint ID: https://www.volcengine.com/docs/82379/1099522
                endPoint = endpoint,
                //固定为 https://ark.cn-beijing.volces.com
                host = ARK_HOST,
                //获取API Key: https://www.volcengine.com/docs/82379/1541594
                apiKey = apiKey
            ).apply {
                defaultCompressSize = compressSize
            })
    }
    //endregion
}
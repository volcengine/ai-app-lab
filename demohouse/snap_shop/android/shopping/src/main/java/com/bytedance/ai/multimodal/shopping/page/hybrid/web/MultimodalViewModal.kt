package com.bytedance.ai.multimodal.shopping.page.hybrid.web

import android.content.Intent
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bytedance.ai.multimodal.common.isNotNullOrEmpty
import com.bytedance.ai.multimodal.shopping.page.hybrid.web.MultimodalWebActivity.Companion.EXTRA_URL
import com.bytedance.ai.multimodal.shopping.page.hybrid.web.MultimodalWebActivity.Companion.IMAGE_ID
import com.bytedance.ai.multimodal.visual.vision.ImageTaskQueue
import com.bytedance.ai.multimodal.visual.vision.cache.ImageRecordCacheDelegate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class MultimodalViewModal : ViewModel() {


    private var imageId: String = ""

    private val _urlState = MutableStateFlow("")

    internal val urlState = _urlState as StateFlow<String>

    fun initData(intent: Intent) {
        viewModelScope.launch(Dispatchers.IO) {
            this@MultimodalViewModal.imageId = intent.getStringExtra(IMAGE_ID).orEmpty()
            val queryMap = intent.extras?.keySet()?.filter { it != EXTRA_URL }
                ?.associate { key -> key to intent.getStringExtra(key) }
            intent.getStringExtra(EXTRA_URL)?.let { url ->
                _urlState.emit(buildUrlWithQuery(url, queryMap))
            }
        }
    }

    private fun buildUrlWithQuery(baseUrl: String?, queryParams: Map<String, String?>?): String {
        if (baseUrl.isNullOrEmpty() || queryParams.isNullOrEmpty()) return baseUrl.orEmpty()

        val uriBuilder = baseUrl.toUri().buildUpon()
        queryParams.forEach { (key, value) ->
            if (key.isNotBlank() && value.isNotNullOrEmpty()) {
                // 自动编码参数值，处理特殊字符
                uriBuilder.appendQueryParameter(key, value)
            }
        }
        return uriBuilder.build().toString()
    }

    override fun onCleared() {
        super.onCleared()
        viewModelScope.launch(Dispatchers.IO) {
            ImageTaskQueue.release(imageId)
            ImageRecordCacheDelegate.remove(imageId)
        }
    }
}
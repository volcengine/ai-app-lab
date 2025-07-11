package com.bytedance.ai.multimodal.demo.page.viewmodel

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.widget.Toast
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bytedance.ai.multimodal.demo.AppCore
import com.bytedance.ai.multimodal.demo.PreferenceUtils
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import com.bytedance.ai.multimodal.visual.vision.ImageTaskQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SettingsViewModel : ViewModel() {
    companion object {
        private const val DEFAULT_MULTIMODAL_WEB_URL = "file:///android_asset/index.html"
    }

        var queryMap = mutableMapOf<String, String>()

    private val _selectedImageUri = MutableLiveData<Uri?>()
    val selectedImageUri: LiveData<Uri?> = _selectedImageUri

    private val _fullUrl = MutableLiveData<String>()
    val fullUrl: LiveData<String> = _fullUrl

    fun fetchQueryMap(bitmap: Bitmap) {
        viewModelScope.launch(Dispatchers.IO) {
            val imageId = ImageTaskQueue.enqueueBitmap(BitMapWithPosition(bitmap))
            queryMap["image_id"] = imageId
            updateFullUrl(getMultimodalWebUrl(AppCore.inst))
        }
    }

    fun updateSelectedImage(uri: Uri) {
        _selectedImageUri.value = uri
    }

    fun updateFullUrl(baseUrl: String) {
        val urlBuilder = StringBuilder(baseUrl)
        if (queryMap.isNotEmpty()) {
            urlBuilder.append("?")
            queryMap.forEach { (key, value) ->
                urlBuilder.append(key).append("=").append(value).append("&")
            }
            urlBuilder.deleteCharAt(urlBuilder.length - 1)
        }
        _fullUrl.postValue(urlBuilder.toString())
    }

    fun getMultimodalWebUrl(context: Context): String {
        var multimodalWebUrl = PreferenceUtils.getStringPref(
            context,
            R.string.pref_key_url,
            ""
        )
        if (multimodalWebUrl.isNullOrEmpty()) {
            PreferenceUtils.saveStringPreference(
                context,
                R.string.pref_key_url,
                DEFAULT_MULTIMODAL_WEB_URL
            )
            multimodalWebUrl = DEFAULT_MULTIMODAL_WEB_URL
        }
        return multimodalWebUrl
    }

    fun saveMultiModalUrl(context: Context, url: String): Boolean {
        if (url.isEmpty()) {
            Toast.makeText(context, "url不能为空", Toast.LENGTH_SHORT).show()
            return false
        }
        PreferenceUtils.saveStringPreference(context, R.string.pref_key_url, url)
        Toast.makeText(context, "保存成功", Toast.LENGTH_SHORT).show()
        return true
    }

    fun resetMultiModalUrl(context: Context) {
        saveMultiModalUrl(context, DEFAULT_MULTIMODAL_WEB_URL)
        updateFullUrl(DEFAULT_MULTIMODAL_WEB_URL)
    }
}
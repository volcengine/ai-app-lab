package com.bytedance.ai.multimodal.shopping

import android.content.Context
import android.preference.PreferenceManager
import androidx.annotation.StringRes
import androidx.core.content.edit

object PreferenceUtils {
    /**
     * 在此处修改前端产物的URL，默认使用本地文件，工程默认不携带前端产物，详见拍照购物前端工程的README.md完成编译。
     * 注意：前端产物需要放置在 assets 目录下。
     */
    private const val DEFAULT_MULTIMODAL_WEB_URL = "file:///android_asset/index.html"

    private fun getIntPref(context: Context, @StringRes prefKeyId: Int, defaultValue: Int): Int {
        val sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context)
        val prefKey = context.getString(prefKeyId)
        return sharedPreferences.getInt(prefKey, defaultValue)
    }

    fun getStringPref(context: Context, @StringRes prefKeyId: Int, defaultValue: String): String? {
        val sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context)
        val prefKey = context.getString(prefKeyId)
        return sharedPreferences.getString(prefKey, defaultValue)
    }

    fun saveStringPreference(context: Context, @StringRes prefKeyId: Int, value: String?) {
        PreferenceManager.getDefaultSharedPreferences(context)
            .edit {
                putString(context.getString(prefKeyId), value)
            }
    }

    fun getMultimodalWebUrl(context: Context): String {
        val multimodalWebUrl = getStringPref(
            context,
            R.string.pref_key_url,
            DEFAULT_MULTIMODAL_WEB_URL
        ) ?: DEFAULT_MULTIMODAL_WEB_URL
        return multimodalWebUrl
    }

    fun saveMultiModalUrl(context: Context, url: String): Boolean {
        saveStringPreference(context, R.string.pref_key_url, url)
        return true
    }

    fun resetMultiModalUrl(activity: Context) {
        saveMultiModalUrl(activity, DEFAULT_MULTIMODAL_WEB_URL)
    }

    fun getConfirmationTimeMs(context: Context): Int = 1000

    private fun getBooleanPref(
        context: Context,
        @StringRes prefKeyId: Int,
        defaultValue: Boolean
    ): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(context.getString(prefKeyId), defaultValue)
}
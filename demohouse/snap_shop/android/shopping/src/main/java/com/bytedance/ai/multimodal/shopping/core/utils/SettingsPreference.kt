package com.bytedance.ai.multimodal.shopping.core.utils

import android.content.SharedPreferences
import android.preference.PreferenceManager
import com.bytedance.ai.multimodal.shopping.AppCore

object SettingsPreference {
    fun getGlobalPreference(): SharedPreferences {
        return PreferenceManager.getDefaultSharedPreferences(AppCore.inst)
    }
}
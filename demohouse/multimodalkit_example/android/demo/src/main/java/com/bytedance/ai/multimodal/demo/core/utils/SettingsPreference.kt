package com.bytedance.ai.multimodal.demo.core.utils

import android.content.SharedPreferences
import android.preference.PreferenceManager
import com.bytedance.ai.multimodal.demo.AppCore

object SettingsPreference {
    fun getGlobalPreference(): SharedPreferences {
        return PreferenceManager.getDefaultSharedPreferences(AppCore.inst)
    }
}
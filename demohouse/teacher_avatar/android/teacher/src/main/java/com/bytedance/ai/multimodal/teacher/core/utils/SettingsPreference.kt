package com.bytedance.ai.multimodal.teacher.core.utils

import android.content.SharedPreferences
import android.preference.PreferenceManager
import com.bytedance.ai.multimodal.teacher.AppCore

object SettingsPreference {
    fun getGlobalPreference(): SharedPreferences {
        return PreferenceManager.getDefaultSharedPreferences(AppCore.inst)
    }
}
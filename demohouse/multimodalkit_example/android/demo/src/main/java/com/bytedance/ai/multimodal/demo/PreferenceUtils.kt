package com.bytedance.ai.multimodal.demo

import android.content.Context
import android.preference.PreferenceManager
import androidx.annotation.StringRes
import androidx.core.content.edit

/** Utility class to retrieve shared preferences. */
object PreferenceUtils {

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

    fun getConfirmationTimeMs(context: Context): Int = 1000

    private fun getBooleanPref(
        context: Context,
        @StringRes prefKeyId: Int,
        defaultValue: Boolean
    ): Boolean =
        PreferenceManager.getDefaultSharedPreferences(context)
            .getBoolean(context.getString(prefKeyId), defaultValue)
}
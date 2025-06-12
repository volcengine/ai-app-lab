package com.example.android.utils

import android.content.Context
import android.content.pm.PackageManager

object PermissionUtils {
    private const val TAG = "PermissionUtils"

    fun hasAllPermissions(context: Context): Boolean {
        return context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == 
               PackageManager.PERMISSION_GRANTED
    }

    fun getPermissionMessage(context: Context): String {
        return "需要录音权限才能使用语音识别功能"
    }
} 
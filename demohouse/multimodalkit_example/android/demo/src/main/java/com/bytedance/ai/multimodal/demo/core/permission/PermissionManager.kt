package com.bytedance.ai.multimodal.demo.core.permission

import com.bytedance.ai.multimodal.demo.AppCore
import com.bytedance.ai.multimodal.demo.core.utils.ActivityManager
import com.hjq.permissions.OnPermissionCallback
import com.hjq.permissions.XXPermissions

object PermissionManager {

    interface RequestPermissionCallback {
        fun onResult(grantedPermissions:List<String>, result: Boolean)
    }

    fun requestPermission(permission: String, callback: RequestPermissionCallback) {
        ActivityManager.currentActivity?.let { activity ->
            if (XXPermissions.isGranted(activity, listOf(permission))) {
                callback.onResult(listOf(permission), true)
            } else {
                XXPermissions.with(activity).permission(permission).request(object : OnPermissionCallback{
                    override fun onGranted(permissions: List<String>, allGranted: Boolean) {
                        callback.onResult(permissions, allGranted)
                    }

                    override fun onDenied(permissions: List<String>, doNotAskAgain: Boolean) {
                        callback.onResult(permissions, false)
                    }
                })
            }
            return
        }
        callback.onResult(emptyList(), false)
    }


    fun requestPermissions(permissions: List<String>, callback: RequestPermissionCallback) {
        ActivityManager.currentActivity?.let { activity ->
            if (XXPermissions.isGranted(activity, permissions)) {
                callback.onResult(permissions, true)
            } else {
                XXPermissions.with(activity).permission(permissions).request { grantedPermissions, allGranted ->
                    callback.onResult(grantedPermissions, allGranted)
                }
            }
            return
        }
        callback.onResult(emptyList(), false)
    }

    fun isPermissionGranted(permission: String): Boolean {
        return XXPermissions.isGranted(AppCore.inst, permission)
    }
}
package com.bytedance.ai.multimodal.teacher.core.permission

import com.bytedance.ai.multimodal.common.IPermissionHandler
import com.bytedance.ai.multimodal.common.PermissionResultCallback

object PermissionHandlerImpl: IPermissionHandler {
    override fun requestPermission(permission: String, callback: PermissionResultCallback) {
         PermissionManager.requestPermission(permission, object:
             PermissionManager.RequestPermissionCallback {
             override fun onResult(grantedPermissions: List<String>, result: Boolean) {
                  callback.onResult(result)
             }
         })
    }

    override fun isPermissionGranted(permission: String): Boolean {
        return PermissionManager.isPermissionGranted(permission)
    }
}
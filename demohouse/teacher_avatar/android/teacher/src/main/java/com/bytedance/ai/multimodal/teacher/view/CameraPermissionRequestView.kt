package com.bytedance.ai.multimodal.teacher.view

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.widget.FrameLayout
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleObserver
import androidx.lifecycle.OnLifecycleEvent
import com.bytedance.ai.multimodal.common.utils.gone
import com.bytedance.ai.multimodal.common.utils.visible
import com.bytedance.ai.multimodal.teacher.databinding.LayoutPermissionRequestBinding
import com.hjq.permissions.OnPermissionCallback
import com.hjq.permissions.Permission
import com.hjq.permissions.XXPermissions

/**
 * 相机权限申请，需要在activity或者fragment的 onCreate 调用
 * lifecycle.addObserver(binding.permissionRequestView)
 */
class CameraPermissionRequestView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : FrameLayout(context, attrs), LifecycleObserver {

    private var binding: LayoutPermissionRequestBinding =
        LayoutPermissionRequestBinding.inflate(LayoutInflater.from(context), this, true)

    @OnLifecycleEvent(Lifecycle.Event.ON_CREATE)
    fun onCreate() {
        if (!XXPermissions.isGranted(context, Permission.CAMERA, Permission.RECORD_AUDIO)) {
            XXPermissions.with(context).permission(Permission.CAMERA, Permission.RECORD_AUDIO)
                .request(object : OnPermissionCallback {
                    override fun onGranted(permissions: MutableList<String>, allGranted: Boolean) {
                        refreshView()
                    }

                    override fun onDenied(
                        permissions: MutableList<String>,
                        doNotAskAgain: Boolean
                    ) {
                        refreshView()
                    }
                })
        } else {
            binding.root.gone()
        }
    }

    @OnLifecycleEvent(Lifecycle.Event.ON_RESUME)
    fun onResume() {
        refreshView()
    }

    private fun refreshView() {
        val isCameraGranted = XXPermissions.isGranted(context, Permission.CAMERA)
        val isAudioGranted = XXPermissions.isGranted(context, Permission.RECORD_AUDIO)

        if (isCameraGranted && isAudioGranted) {
            binding.root.gone()
        }

        if (isCameraGranted) {
            binding.tvCameraPermissionRequest.gone()
        } else {
            binding.tvCameraPermissionRequest.visible()
            binding.tvCameraPermissionRequest.setOnClickListener {
                context?.let { it1 ->
                    XXPermissions.startPermissionActivity(
                        it1, listOf(
                            Permission.CAMERA
                        )
                    )
                }
            }
        }
        if (isAudioGranted) {
            binding.tvAudioPermissionRequest.gone()
        } else {
            binding.tvAudioPermissionRequest.visible()
            binding.tvAudioPermissionRequest.setOnClickListener {
                context?.let { it1 ->
                    XXPermissions.startPermissionActivity(
                        it1, listOf(
                            Permission.RECORD_AUDIO
                        )
                    )
                }
            }
        }
    }

}
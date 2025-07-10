package com.bytedance.ai.multimodal.shopping

import android.app.Application
import android.content.Context
import android.content.Intent
import android.graphics.Point
import android.graphics.Rect
import androidx.activity.result.ActivityResultLauncher
import androidx.lifecycle.AndroidViewModel
import com.bytedance.ai.multimodal.common.log.FLogger
import com.bytedance.ai.multimodal.shopping.core.permission.PermissionManager
import com.bytedance.ai.multimodal.shopping.core.utils.ActivityManager
import com.bytedance.ai.multimodal.shopping.page.hybrid.web.MultimodalWebActivity
import com.bytedance.ai.multimodal.shopping.PreferenceUtils
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import com.bytedance.ai.multimodal.visual.vision.ImageTaskQueue
import com.hjq.permissions.Permission
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class CameraShotWorkflow(application: Application) : AndroidViewModel(application) {

    suspend fun enqueueBitmap(
        cameraMode: Pair<String, String>,
        bitMapWithPosition: BitMapWithPosition,
        query: String?,
        point: Point? = null,
        rect: Rect? = null,
    ) {
        ImageTaskQueue.enqueueBitmap(bitMapWithPosition).also { imageId ->
            FLogger.d("CameraShotWorkflow", "enqueueBitmap: $imageId w=${bitMapWithPosition.bitmap.width} h=${bitMapWithPosition.bitmap.height}")
            withContext(Dispatchers.Main) {
                val params = mutableMapOf<String, String>()

                point?.let {
                    params["point_x"] = it.x.toString()
                    params["point_y"] = it.y.toString()
                }

                rect?.let {
                    params["rect_left"] = it.left.toString()
                    params["rect_top"] = it.top.toString()
                    params["rect_right"] = it.right.toString()
                    params["rect_bottom"] = it.bottom.toString()
                }

                params["image_width"] = bitMapWithPosition.bitmap.width.toString()
                params["image_height"] = bitMapWithPosition.bitmap.height.toString()
                ActivityManager.currentActivity?.get()?.let {
                    openCameraAgentPage(
                        it,
                        cameraMode,
                        imageId,
                        query,
                        params
                    )
                }
            }
        }
    }

    private fun openCameraAgentPage(
        context: Context,
        currentMode: Pair<String, String>,
        imageId: String,
        query: String?,
        extra: Map<String, String> = emptyMap()
    ) {
        val url = PreferenceUtils.getMultimodalWebUrl(context)
        MultimodalWebActivity.startActivity(
            context, url, mutableMapOf(
                "query" to (query ?: ""),
                "image_id" to imageId,
                "camera_mode" to currentMode.second,
            ).apply { putAll(extra) }
        )
    }


    fun enqueueBitmapJob(
        cameraMode: Pair<String, String>,
        query: String?,
        fetchBitmapJob: Deferred<BitMapWithPosition?>,
        point: Point? = null,
        rect: Rect? = null,
    ) =
        CoroutineScope(Dispatchers.IO).launch {
            fetchBitmapJob.await()?.apply {
                enqueueBitmap(cameraMode, this, query, point, rect)
            }
        }

    fun openAlbum(albumResultLauncher: ActivityResultLauncher<Intent>) {
        PermissionManager.requestPermission(
            Permission.READ_MEDIA_IMAGES,
            object : PermissionManager.RequestPermissionCallback {
                override fun onResult(grantedPermissions: List<String>, result: Boolean) {
                    val intent = Intent(Intent.ACTION_GET_CONTENT)
                    intent.type = "image/*"
                    albumResultLauncher.launch(intent)
                }
            })
    }
}

package com.bytedance.ai.multimodal.teacher.vision

import android.graphics.Bitmap

interface InputInfo {
    fun getBitmap(): Bitmap?

}

class BitmapInputInfo(private val bitmap: Bitmap?) : InputInfo {
    override fun getBitmap(): Bitmap? {
        return bitmap
    }
}
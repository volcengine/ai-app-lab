package com.bytedance.ai.multimodal.demo.core.utils

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.Image
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

fun Bitmap.rotate(degrees: Float): Bitmap =
    Bitmap.createBitmap(this, 0, 0, width, height, Matrix().apply { postRotate(degrees) }, true)

fun Bitmap.toByteArray(): ByteArray {
    val byteArrayOutputStream = ByteArrayOutputStream()
    this.compress(Bitmap.CompressFormat.JPEG, 100, byteArrayOutputStream)
    return byteArrayOutputStream.toByteArray()
}

fun Image.toBitmap(): Bitmap? {
    val buffer = planes[0].buffer
    buffer.rewind()
    val bytes = ByteArray(buffer.capacity())
    buffer.get(bytes)
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
}

fun ImageProxy.toBitmap(): Bitmap {
    use {
        val buffer: ByteBuffer = planes[0].buffer
        val bytes = ByteArray(buffer.capacity())
        buffer.get(bytes)
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }
}

fun ImageProxy.toBitmap(flip: Boolean): Bitmap? {
    //TODO 暂时不支持UVC
//    if (this is UvcImageProxy) {
//        return BitmapFactory.decodeByteArray(this.data, 0, data.size)
//    } else {
        val bitmapBuffer =
            Bitmap.createBitmap(
                width,
                height,
                Bitmap.Config.ARGB_8888
            )
        use { bitmapBuffer.copyPixelsFromBuffer(planes[0].buffer) }

        val matrix = Matrix().apply {
            postRotate(imageInfo.rotationDegrees.toFloat())

            if (flip) {
                postScale(
                    -1f,
                    1f,
                    width.toFloat(),
                    height.toFloat()
                )
            }
        }
        return Bitmap.createBitmap(
            bitmapBuffer, 0, 0, bitmapBuffer.width, bitmapBuffer.height,
            matrix, true
        )
//    }
}


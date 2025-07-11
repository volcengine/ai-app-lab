package com.bytedance.ai.multimodal.demo

import android.content.Context
import android.content.res.AssetFileDescriptor
import android.util.Log
import com.bytedance.ai.multimodal.common.download.IModelDownloader
import com.bytedance.ai.multimodal.common.log.FLogger
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * 模型文件下载器
 * 在本Example里默认直接读取assets目录
 */
class ModelDownloader() : IModelDownloader {
    companion object {
        const val TAG = "ModelDownloadManager"
    }

    override suspend fun loadModelAsFilePath(model: String): String? {
        val assets = assetFilePath(AppCore.inst, model)
        if (assets != null) {
            Log.d(TAG, "load $model from assets")
            return assets
        }
        return null
    }

    override suspend fun loadModelAsByteBuffer(model: String): ByteBuffer? {
        val assets = kotlin.runCatching {
            loadMappedFile(AppCore.inst, model)
        }.getOrNull()?: readFromAssets(model)?.let {
            ByteBuffer.wrap(it)
        }
        if (assets != null) {
            Log.d(TAG,"load $model from assets")
            return assets
        }
        return null
    }

    private fun assetFilePath(context: Context, assetName: String): String? {
        val inputLength: Long
        try {
            val assetStream = context.assets.open(assetName)
            inputLength = assetStream.available().toLong()
            assetStream.close()
        } catch (e: IOException) {
            FLogger.e(TAG, "assetFilePath: ", e)
            return null
        }
        val file = File(context.filesDir, assetName)
        val outputLength = file.length()
        if (file.exists() && outputLength > 0) {
            if (outputLength == inputLength) {
                return file.absolutePath
            } else {
                file.writeText("")
            }
        }

        return try {
            copyAssetFile(context, assetName, file)
            file.absolutePath
        } catch (_: Exception) {
            null
        }
    }

    private fun copyAssetFile(context: Context, sourceAsset: String, target: File) {
        if (target.exists() && target.length() > 0) {
            return
        }

        val inputStream: InputStream = context.assets.open(sourceAsset)
        val outputStream: OutputStream = FileOutputStream(target)

        inputStream.use { inputs ->
            outputStream.use { os ->
                val buffer = ByteArray(4 * 1024)
                var read: Int
                while (inputs.read(buffer).also { read = it } != -1) {
                    os.write(buffer, 0, read)
                }
                os.flush()
            }
        }
    }

    @Throws(IOException::class)
    private fun loadMappedFile(context: Context, filePath: String): MappedByteBuffer {
        require(filePath.isNotBlank()) { "File path cannot be null or blank." }

        val assetFileDescriptor: AssetFileDescriptor = context.assets.openFd(filePath)

        // 使用 use 函数自动管理资源关闭
        return assetFileDescriptor.use { descriptor ->
            FileInputStream(descriptor.fileDescriptor).use { fileInputStream ->
                fileInputStream.channel.use { fileChannel ->
                    // 内存映射文件
                    val startOffset = descriptor.startOffset
                    val declaredLength = descriptor.declaredLength
                    fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
                }
            }
        }
    }

    private fun readFromAssets(modelPath: String): ByteArray? {
        return kotlin.runCatching {
            AppCore.inst.assets.open(modelPath).use {
                it.readBytes()
            }
        }.onFailure {
            FLogger.w(TAG, "read from assets fail", it)
        }.getOrNull()
    }

}
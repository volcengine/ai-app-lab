package com.example.android.service
import javax.net.ssl.HttpsURLConnection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.MediaPlayer
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import java.security.cert.X509Certificate
import android.graphics.Bitmap

class ScreenshotService : Service() {
    companion object {
        const val ACTION_START = "com.example.android.action.START_SCREENSHOT"
        const val ACTION_STOP = "com.example.android.action.STOP_SCREENSHOT"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val SERVER_IP = "server_ip"
        const val CONTEXT_ID = "context_id"
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "screenshot_channel"
        private const val TAG = "ScreenshotService"
        private const val UPLOAD_URL = "http://%s/api/v3/bots/chat/completions"
        private const val SCREENSHOT_INTERVAL = 3000L
        private const val VIRTUAL_DISPLAY_NAME = "ScreenshotService"
        private const val MAX_UPLOAD_RETRIES = 3
        private const val UPLOAD_RETRY_DELAY = 1000L
    }

    private var resultCode: Int = 0
    private var resultData: Intent? = null
    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaProjection: MediaProjection? = null
    private val handler = Handler(Looper.getMainLooper())
    private var isCapturing = false
    private var isProcessingRequest = false
    private var isPlayingAudio = false
    private var screenWidth = 0
    private var screenHeight = 0
    private var screenDensity = 0
    private var serverIp = ""
    private var contextId = ""
    private val okHttpClient: OkHttpClient by lazy {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
        })

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, trustAllCerts, java.security.SecureRandom())

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            setLevel(HttpLoggingInterceptor.Level.BODY)
        }

        OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
            .hostnameVerifier { _, _ -> true }
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private val mediaProjectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            Log.d(TAG, "MediaProjection stopped")
            cleanup()
            stopSelf()
        }
    }

    private var mediaPlayer: MediaPlayer? = null
    private val tempAudioDir: File by lazy {
        File(cacheDir, "temp_audio").apply {
            if (!exists()) {
                mkdirs()
            }
        }
    }

    init {
        try {
            // 配置信任所有证书（仅用于开发环境）
            val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
                override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            })
            
            val sslContext = SSLContext.getInstance("TLS")
            sslContext.init(null, trustAllCerts, java.security.SecureRandom())
            
            // 设置默认的 SSL 套接字工厂
            HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.socketFactory)
            
            // 设置主机名验证器
            HttpsURLConnection.setDefaultHostnameVerifier { _, _ -> true }
            
            // 设置系统属性以允许不安全的 SSL
            System.setProperty("https.protocols", "TLSv1.2")
            System.setProperty("javax.net.ssl.trustStore", "NONE")
            System.setProperty("javax.net.ssl.trustStoreType", "BKS")
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing SSL context", e)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i("intent", intent?.getStringExtra(SERVER_IP).toString())
        Log.d(TAG, "Service started with action: ${intent?.action}")
        when (intent?.action) {
            ACTION_START -> {
                resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA)
                serverIp = intent.getStringExtra(SERVER_IP) ?: ""
                contextId = intent.getStringExtra(CONTEXT_ID) ?: ""
                if (resultData != null) {
                    Log.d(TAG, "Starting screenshot capture")
                    setupScreenCapture()
                    startPeriodicScreenshot()
                } else {
                    Log.e(TAG, "Result data is null")
                }
            }
            ACTION_STOP -> {
                Log.d(TAG, "Stopping screenshot capture")
                cleanup()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun setupScreenCapture() {
        try {
            val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            windowManager.defaultDisplay.getMetrics(metrics)
            screenWidth = metrics.widthPixels
            screenHeight = metrics.heightPixels
            screenDensity = metrics.densityDpi

            // 只在这里创建一次 ImageReader
            if (imageReader == null) {
                imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2)
                imageReader?.setOnImageAvailableListener({ reader ->
                    // 再次检查状态，确保没有正在处理的请求和播放的音频
                    if (isProcessingRequest || isPlayingAudio) {
                        Log.d(TAG, "Skipping image processing: request in progress or audio playing")
                        return@setOnImageAvailableListener
                    }

                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        try {
                            Log.d(TAG, "Processing captured image")
                            val planes = image.planes
                            val buffer = planes[0].buffer
                            val pixelStride = planes[0].pixelStride
                            val rowStride = planes[0].rowStride
                            val rowPadding = rowStride - pixelStride * screenWidth

                            val bitmap = Bitmap.createBitmap(
                                screenWidth + rowPadding / pixelStride,
                                screenHeight,
                                Bitmap.Config.ARGB_8888
                            )
                            bitmap.copyPixelsFromBuffer(buffer)

                            // 裁剪掉多余的部分
                            val croppedBitmap = Bitmap.createBitmap(
                                bitmap,
                                0,
                                0,
                                screenWidth,
                                screenHeight
                            )

                            // 保存截图
                            val outputStream = ByteArrayOutputStream()
                            croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream)
                            val imageBytes = outputStream.toByteArray()
                            Log.d(TAG, "Image captured, size: ${imageBytes.size} bytes")

                            // 上传截图
                            uploadScreenshot(imageBytes)

                            // 释放资源
                            croppedBitmap.recycle()
                            bitmap.recycle()
                        } finally {
                            image.close()
                        }
                    }
                }, handler)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up screen capture", e)
            cleanup()
            stopSelf()
        }
    }

    private fun takeScreenshot() {
        try {
            // 双重检查，确保没有正在处理的请求和播放的音频
            if (isProcessingRequest || isPlayingAudio) {
                Log.d(TAG, "Skipping screenshot: request in progress or audio playing")
                return
            }

            val imageReader = imageReader ?: run {
                Log.e(TAG, "ImageReader is null")
                return
            }
            // 触发一次图像捕获
            imageReader.acquireLatestImage()?.close()
            Log.d(TAG, "Screenshot triggered")
        } catch (e: Exception) {
            Log.e(TAG, "Error triggering screenshot", e)
        }
    }

    private fun startPeriodicScreenshot() {
        if (isCapturing) return
        isCapturing = true

        // 确保 ImageReader 和 VirtualDisplay 都已创建
        setupScreenCapture()
        createVirtualDisplay()

        if (virtualDisplay == null) {
            Log.e(TAG, "Failed to create VirtualDisplay")
            cleanup()
            stopSelf()
            return
        }

        // 使用 Handler 替代 Timer，这样可以更好地控制请求间隔
        handler.post(object : Runnable {
            override fun run() {
                if (!isCapturing) return

                // 只有在没有正在处理的请求时，才进行新的截图
                if (!isProcessingRequest) {
                    takeScreenshot()
                }
                
                // 无论是否处理了截图，都按固定间隔继续检查
                handler.postDelayed(this, SCREENSHOT_INTERVAL)
            }
        })
        Log.d(TAG, "Periodic screenshot started")
    }

    private fun createVirtualDisplay() {
        try {
            val mediaProjection = getMediaProjection()
            if (virtualDisplay == null && imageReader != null) {
                virtualDisplay = mediaProjection?.createVirtualDisplay(
                    VIRTUAL_DISPLAY_NAME,
                    screenWidth,
                    screenHeight,
                    screenDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader?.surface,
                    null,
                    handler
                )
                Log.d(TAG, "VirtualDisplay created successfully")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error creating virtual display", e)
            stopSelf()
        }
    }

    private fun getMediaProjection(): MediaProjection? {
        if (mediaProjection == null) {
            mediaProjection = (getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager)
                .getMediaProjection(resultCode, resultData!!)
            mediaProjection?.registerCallback(mediaProjectionCallback, handler)
        }
        return mediaProjection
    }

    private fun cleanup() {
        try {
            Log.d(TAG, "Cleaning up resources")
            handler.removeCallbacksAndMessages(null) // 移除所有待处理的回调
            virtualDisplay?.release()
            virtualDisplay = null
            imageReader?.close()
            imageReader = null
            mediaProjection?.unregisterCallback(mediaProjectionCallback)
            mediaProjection = null
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup", e)
        } finally {
            isCapturing = false
            isProcessingRequest = false
            isPlayingAudio = false
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Screenshot Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("截图服务")
            .setContentText("正在处理截图")
            .setSmallIcon(android.R.drawable.stat_notify_call_mute)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        cleanup()
        mediaPlayer?.release()
        mediaPlayer = null
        // 清理临时音频文件
        tempAudioDir.listFiles()?.forEach { it.delete() }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun uploadScreenshot(imageBytes: ByteArray) {
        Thread {
            var retryCount = 0
            var success = false
            
            while (retryCount < MAX_UPLOAD_RETRIES && !success) {
                try {
                    // 设置状态为正在处理请求
                    isProcessingRequest = true
                    Log.d(TAG, "Starting upload to $UPLOAD_URL, attempt ${retryCount + 1}")
                    val base64Image = Base64.encodeToString(imageBytes, Base64.NO_WRAP)
                    
                    // 截断 base64 图像数据用于日志显示
                    val truncatedImage = if (base64Image.length > 20) {
                        base64Image.substring(0, 20) + "..."
                    } else {
                        base64Image
                    }
                    Log.d(TAG, "Image data length: ${base64Image.length}, content: $truncatedImage")
                    
                    val jsonRequest = JSONObject().apply {
                        put("model", "bot-20241114164326-xlcc91")
                        put("stream", false)
                        put("messages", JSONArray().apply {
                            put(JSONObject().apply {
                                put("role", "user")
                                put("content", JSONArray().apply {
                                    put(JSONObject().apply {
                                        put("type", "text")
                                        put("text", "")
                                    })
                                    put(JSONObject().apply {
                                        put("type", "image_url")
                                        put("image_url", JSONObject().apply {
                                            put("url", "data:image/jpeg;base64,$base64Image")
                                        })
                                    })
                                })
                            })
                        })
                    }

                    val request = Request.Builder()
                        .url(UPLOAD_URL.format(serverIp))
                        .post(jsonRequest.toString().toRequestBody("application/json".toMediaTypeOrNull()))
                        .addHeader("X-Context-Id", contextId)
                        .addHeader("Connection", "close")
                        .build()

                    Log.d("ScreenshotService", "ScreenshotService: " + contextId)
                    val response = okHttpClient.newCall(request).execute()
                    val responseCode = response.code

                    if (response.isSuccessful) {
                        Log.d(TAG, "Upload successful")
                        success = true
                    } else {
                        Log.e(TAG, "Upload failed with response code: $responseCode")
                        val errorBody = response.body?.string()
                        Log.e(TAG, "Error response: $errorBody")
                        retryCount++
                        if (retryCount < MAX_UPLOAD_RETRIES) {
                            Thread.sleep(UPLOAD_RETRY_DELAY)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error uploading screenshot", e)
                    retryCount++
                    if (retryCount < MAX_UPLOAD_RETRIES) {
                        Thread.sleep(UPLOAD_RETRY_DELAY)
                    }
                } finally {
                    isProcessingRequest = false
                }
            }
            
            if (!success) {
                Log.e(TAG, "Failed to upload screenshot after $MAX_UPLOAD_RETRIES attempts")
            }
        }.start()
    }
}

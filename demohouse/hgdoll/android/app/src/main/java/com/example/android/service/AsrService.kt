package com.example.android.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okio.ByteString
import java.util.zip.GZIPOutputStream
import java.util.zip.GZIPInputStream
import com.google.gson.Gson
import android.util.Base64
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import android.media.AudioManager
import android.media.AudioAttributes
import android.content.Context
import android.media.AudioFocusRequest
import java.net.SocketTimeoutException
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AsrService : Service() {
    companion object {
        const val ACTION_START = "com.example.android.action.START_ASR"
        const val ACTION_STOP = "com.example.android.action.STOP_ASR"
        const val EXTRA_ACCESS_TOKEN = "extra_access_token"
        const val EXTRA_APP_ID = "extra_app_id"
        const val SERVER_IP = "server_ip"
        const val CONTEXT_ID = "context_id"
        private const val NOTIFICATION_ID = 3
        private const val CHANNEL_ID = "asr_service_channel"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
        private const val UPLOAD_URL = "http://%s/api/v3/bots/chat/completions"
        private const val ASR_RESOURCE_ID = "volc.bigasr.sauc.duration"
        private const val CONNECT_ID = "67ee89ba-7050-4c04-a3d7-ac61a63499b3"
        private const val BUFFER_SIZE = 16000 // 200ms of audio data (16kHz * 2bytes * 0.2s)
        private const val AUDIO_FORMAT_CONFIG = "pcm"
        private const val AUDIO_BITS = 16
        private const val AUDIO_CHANNELS = 1
        private const val MAX_RETRIES = 3
        private const val INIT_TIMEOUT = 10000L // 增加到 10 秒
        private const val FORCE_DEFINITE_DURATION = 10000L // 10s
        private const val SEND_INTERVAL = 1000L // 增加发送间隔
        private const val RECONNECT_DELAY = 5000L // 增加到 5 秒
        private const val PING_INTERVAL = 30000L // 30秒
        private const val PONG_TIMEOUT = 15000L // 15秒
        private const val MAX_PING_FAILURES = 3 // 最大ping失败次数

        // 协议相关常量
        private const val PROTOCOL_VERSION = 0b0001
        private const val DEFAULT_HEADER_SIZE = 0b0001
        private const val FULL_CLIENT_REQUEST = 0b0001
        private const val AUDIO_ONLY_REQUEST = 0b0010
        private const val FULL_SERVER_RESPONSE = 0b1001
        private const val SERVER_ACK = 0b1011
        private const val POS_SEQUENCE = 0b0001
        private const val NEG_WITH_SEQUENCE = 0b0011
        private const val JSON = 0b0001
        private const val GZIP = 0b0001
        private const val RAW = 0x0002
    }


    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private val isRecording = AtomicBoolean(false)
    private var isInitialized = AtomicBoolean(false)
    private var webSocket: WebSocket? = null
    private var accessToken = ""
    private var appId = ""
    private var serverIp = ""
    private var contextId = ""

    private var sequence = 0
    private var retryCount = 0
    private var lastVoiceTime = 0L  // 上次检测到语音的时间
    private var silenceDuration = 0L  // 静音持续时间
    private val SILENCE_THRESHOLD = 300  // 降低静音阈值
    private val MIN_SILENCE_DURATION = 3000L  // 增加最小静音持续时间
    private var isAlreadyDefinite = false  // 是否已经收到过 definite result
    private var lastAsrTime = 0L  // 上次收到识别结果的时间
    private var currentText = ""  // 当前的识别文本
    private var startTime = 0L  // 开始时间
    private var isSpeaking = false  // 是否正在说话
    private var voiceBuffer = ByteArrayOutputStream()  // 存储语音数据
    private var LAST_RESPONSE_TIME = 0L
    private var isProcessingRequest = false
    private var isPlayingAudio = false
    private var mediaPlayer: MediaPlayer? = null
    private val tempAudioDir: File by lazy {
        File(cacheDir, "temp_audio").apply {
            if (!exists()) {
                mkdirs()
            }
        }
    }

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .pingInterval(5, TimeUnit.SECONDS)  // 减少 ping 间隔到 5 秒
        .retryOnConnectionFailure(true)
        .build()

    private var audioManager: AudioManager? = null

    private var lastPingTime = 0L
    private var isConnecting = AtomicBoolean(false)

    private var audioFocusRequest: AudioFocusRequest? = null
    private var audioFocusGranted = false

    private var pingFailureCount = 0
    private var lastPongTime = 0L

    private var statusCodeRetryCount = 0

    private var originalVolume = 0
    private val VOLUME_REDUCTION_FACTOR = 0.5f  // 降低到原始音量的50%

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i("intent", intent.toString())
        when (intent?.action) {
            ACTION_START -> {
                accessToken = intent.getStringExtra(EXTRA_ACCESS_TOKEN) ?: ""
                appId = intent.getStringExtra(EXTRA_APP_ID) ?: ""
                serverIp = intent.getStringExtra(SERVER_IP) ?: ""
                contextId = intent.getStringExtra(CONTEXT_ID) ?: ""
                startAsr()
            }
            ACTION_STOP -> stopAsr()
        }
        return START_NOT_STICKY
    }

    private fun getHeader(messageType: Int, messageTypeSpecificFlags: Int, serialMethod: Int, compressionType: Int, reservedData: Int): ByteArray {
        val header = ByteArray(4)
        header[0] = ((PROTOCOL_VERSION shl 4) or DEFAULT_HEADER_SIZE).toByte()
        header[1] = ((messageType shl 4) or messageTypeSpecificFlags).toByte()
        header[2] = ((serialMethod shl 4) or compressionType).toByte()
        header[3] = reservedData.toByte()
        return header
    }

    private fun intToBytes(a: Int): ByteArray {
        return byteArrayOf(
            ((a ushr 24) and 0xFF).toByte(),
            ((a ushr 16) and 0xFF).toByte(),
            ((a ushr 8) and 0xFF).toByte(),
            (a and 0xFF).toByte()
        )
    }

    private fun gzipCompress(src: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        val gzip = GZIPOutputStream(out)
        gzip.write(src)
        gzip.close()
        return out.toByteArray()
    }

    private fun connectWebSocket() {
        if (isConnecting.get()) {
            Log.d("AsrService", "Already connecting, skipping...")
            return
        }

        isConnecting.set(true)
        Log.d("AsrService", "Connecting to WebSocket...")

        try {
            // 确保关闭旧的连接
            webSocket?.close(1000, "Reconnecting")
            Thread.sleep(100)
        } catch (e: Exception) {
            Log.e("AsrService", "Error closing old WebSocket", e)
        }

        val request = Request.Builder()
            .url(ASR_URL)
            .addHeader("X-Api-App-Key", appId)
            .addHeader("X-Api-Access-Key", accessToken)
            .addHeader("X-Api-Resource-Id", ASR_RESOURCE_ID)
            .addHeader("X-Api-Connect-Id", CONNECT_ID)
            .addHeader("Content-Type", "application/json")
            .addHeader("User-Agent", "OkHttp Android")
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("AsrService", "WebSocket connection opened")
                retryCount = 0
                pingFailureCount = 0
                lastPingTime = 0
                lastPongTime = 0
                isConnecting.set(false)
                
                // 发送初始化消息
                val user = JSONObject().apply {
                    put("uid", "ARK_VLM_DEMO")
                }
                val audio = JSONObject().apply {
                    put("format", AUDIO_FORMAT_CONFIG)
                    put("sample_rate", SAMPLE_RATE)
                    put("bits", AUDIO_BITS)
                    put("channel", AUDIO_CHANNELS)
                }
                val request = JSONObject().apply {
                    put("model_name", "bigmodel")
                    put("result_type", "single")
                    put("show_utterances", true)
                    put("end_window_size", 600)
                    put("force_to_speech_time", 1500)
                }
                val payload = JSONObject().apply {
                    put("user", user)
                    put("audio", audio)
                    put("request", request)
                }
                
                val payloadStr = payload.toString()
                val payloadBytes = gzipCompress(payloadStr.toByteArray())
                val header = getHeader(FULL_CLIENT_REQUEST, POS_SEQUENCE, JSON, GZIP, 0)
                val payloadSize = intToBytes(payloadBytes.size)
                sequence = 1
                val seqBytes = intToBytes(sequence)
                
                val fullClientRequest = ByteArray(header.size + seqBytes.size + payloadSize.size + payloadBytes.size)
                var destPos = 0
                System.arraycopy(header, 0, fullClientRequest, destPos, header.size)
                destPos += header.size
                System.arraycopy(seqBytes, 0, fullClientRequest, destPos, seqBytes.size)
                destPos += seqBytes.size
                System.arraycopy(payloadSize, 0, fullClientRequest, destPos, payloadSize.size)
                destPos += payloadSize.size
                System.arraycopy(payloadBytes, 0, fullClientRequest, destPos, payloadBytes.size)
                
                try {
                    val result = webSocket.send(ByteString.of(*fullClientRequest))
                    if (!result) {
                        Log.e("AsrService", "Failed to send initialization message")
                        throw Exception("Failed to send initialization message")
                    }
                    Log.d("AsrService", "Initialization message sent successfully")
                } catch (e: Exception) {
                    Log.e("AsrService", "Error during initialization", e)
                    webSocket.close(1000, "Initialization failed")
                    isInitialized.set(false)
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d("AsrService", "Received pong from server")
                lastPongTime = System.currentTimeMillis()
                pingFailureCount = 0
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                Log.d("AsrService", "Received message from server")
                lastPongTime = System.currentTimeMillis()
                pingFailureCount = 0
                val res = bytes.toByteArray()
                val sequence = parseResponse(res)
                LAST_RESPONSE_TIME = System.currentTimeMillis()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("AsrService", "WebSocket error: ${t.message}", t)
                isInitialized.set(false)
                isConnecting.set(false)
                
                if (t is SocketTimeoutException) {
                    // 如果是超时错误，立即重试
                    Log.d("AsrService", "Socket timeout, retrying immediately")
                    connectWebSocket()
                } else if (retryCount < MAX_RETRIES) {
                    retryCount++
                    val delay = RECONNECT_DELAY * retryCount
                    Log.d("AsrService", "Retrying connection in ${delay}ms, attempt $retryCount")
                    Thread.sleep(delay)
                    connectWebSocket()
                } else {
                    Log.e("AsrService", "Max retries reached, stopping ASR")
                    stopAsr()
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("AsrService", "WebSocket closing: $code - $reason")
                isInitialized.set(false)
                isConnecting.set(false)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("AsrService", "WebSocket closed: $code - $reason")
                isInitialized.set(false)
                isConnecting.set(false)
            }
        })
    }

    private fun checkConnection() {
        if (!isInitialized.get() || webSocket == null) {
            return
        }

        val currentTime = System.currentTimeMillis()
        
        // 检查是否需要发送ping
        if (currentTime - lastPingTime > PING_INTERVAL) {
            try {
                val result = webSocket?.send("")
                if (result == true) {
                    lastPingTime = currentTime
                    Log.d("AsrService", "Sent ping to server")
                } else {
                    Log.e("AsrService", "Failed to send ping")
                    handlePingFailure()
                }
            } catch (e: Exception) {
                Log.e("AsrService", "Error sending ping", e)
                handlePingFailure()
            }
        }

        // 检查pong是否超时
        if (lastPingTime > 0 && currentTime - lastPingTime > PONG_TIMEOUT) {
            Log.e("AsrService", "Pong timeout, reconnecting...")
            handlePingFailure()
        }

        // 检查服务器响应超时
        if (currentTime - LAST_RESPONSE_TIME > INIT_TIMEOUT) {
            Log.e("AsrService", "No response from server for too long, reconnecting...")
            handlePingFailure()
        }
    }

    private fun handlePingFailure() {
        pingFailureCount++
        if (pingFailureCount >= MAX_PING_FAILURES) {
            Log.e("AsrService", "Max ping failures reached, reconnecting...")
            isInitialized.set(false)
            connectWebSocket()
            pingFailureCount = 0
        }
    }

    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setOnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_GAIN -> {
                            Log.d("AsrService", "Audio focus gained")
                            audioFocusGranted = true
                            // 恢复录音
                            if (isRecording.get() && audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
                                audioRecord?.startRecording()
                            }
                        }
                        AudioManager.AUDIOFOCUS_LOSS -> {
                            Log.d("AsrService", "Audio focus lost")
                            audioFocusGranted = false
                            // 暂停录音
                            audioRecord?.stop()
                        }
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            Log.d("AsrService", "Audio focus lost transiently")
                            audioFocusGranted = false
                            // 暂停录音
                            audioRecord?.stop()
                        }
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                            Log.d("AsrService", "Audio focus lost transiently can duck")
                            audioFocusGranted = false
                            // 暂停录音，因为 AudioRecord 不支持动态音量调整
                            audioRecord?.stop()
                        }
                    }
                }
                .build()

            val result = audioManager?.requestAudioFocus(audioFocusRequest!!)
            audioFocusGranted = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            Log.d("AsrService", "Audio focus request result: $result")
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let {
                audioManager?.abandonAudioFocusRequest(it)
                audioFocusGranted = false
                Log.d("AsrService", "Audio focus abandoned")
            }
        }
    }

    private fun startAsr() {
        if (isRecording.get()) {
            return
        }

        try {
            // 发送初始文本
            GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    sendTextAsr("应用初始化")
                } catch (e: Exception) {
                    Log.e("AsrService", "Error sending initial text", e)
                }
            }

            // 请求音频焦点
            requestAudioFocus()
            if (!audioFocusGranted) {
                Log.e("AsrService", "Failed to get audio focus")
                return
            }

            // 先停止并释放之前的录音实例
            try {
                audioRecord?.stop()
                audioRecord?.release()
                Thread.sleep(2000) // 增加等待时间到2秒
            } catch (e: Exception) {
                Log.e("AsrService", "Error releasing previous AudioRecord", e)
            }

            // 检查麦克风是否可用
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (!audioManager.isMicrophoneMute) {
                Log.d("AsrService", "Microphone is not muted")
            } else {
                Log.w("AsrService", "Microphone is muted, trying to unmute")
                audioManager.isMicrophoneMute = false
            }

            // 重置音频路由
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            audioManager.isSpeakerphoneOn = false
            audioManager.setStreamVolume(AudioManager.STREAM_VOICE_CALL, 
                audioManager.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL) / 2, 0)
            
            // 设置音频参数，启用回声消除和噪声抑制
            audioManager.setParameters("noise_suppression=on")
            audioManager.setParameters("echo_cancellation=on")
            audioManager.setParameters("agc=on")

            // 获取推荐的缓冲区大小
            val bufferSize = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT
            )
            Log.d("AsrService", "AudioRecord buffer size: $bufferSize")

            // 使用更大的缓冲区大小
            val actualBufferSize = bufferSize * 2
            Log.d("AsrService", "Using actual buffer size: $actualBufferSize")

            // 尝试不同的音频源和配置，优先使用VOICE_COMMUNICATION
            val configs = arrayOf(
                Triple(MediaRecorder.AudioSource.VOICE_COMMUNICATION, SAMPLE_RATE, actualBufferSize),
                Triple(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, actualBufferSize),
                Triple(MediaRecorder.AudioSource.CAMCORDER, SAMPLE_RATE, actualBufferSize),
                Triple(MediaRecorder.AudioSource.MIC, SAMPLE_RATE, actualBufferSize)
            )

            var audioRecordInitialized = false
            var lastException: Exception? = null

            for ((audioSource, sampleRate, bufferSize) in configs) {
                try {
                    Log.d("AsrService", "Trying audio source: $audioSource, sample rate: $sampleRate, buffer size: $bufferSize")
                    
                    // 创建新的AudioRecord实例
                    audioRecord = AudioRecord(
                        audioSource,
                        sampleRate,
                        CHANNEL_CONFIG,
                        AUDIO_FORMAT,
                        bufferSize
                    )

                    if (audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
                        Log.d("AsrService", "Successfully initialized AudioRecord with source: $audioSource")
                        audioRecordInitialized = true
                        break
                    } else {
                        Log.e("AsrService", "Failed to initialize AudioRecord with source: $audioSource")
                        audioRecord?.release()
                    }
                } catch (e: Exception) {
                    Log.e("AsrService", "Error initializing AudioRecord with source: $audioSource", e)
                    lastException = e
                    audioRecord?.release()
                    Thread.sleep(1000) // 在尝试下一个配置之前等待更长时间
                }
            }

            if (!audioRecordInitialized) {
                // 如果所有配置都失败，尝试使用默认配置
                try {
                    Log.d("AsrService", "Trying default configuration as last resort")
                    audioRecord = AudioRecord(
                        MediaRecorder.AudioSource.MIC,
                        SAMPLE_RATE,
                        CHANNEL_CONFIG,
                        AUDIO_FORMAT,
                        AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
                    )

                    if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                        throw lastException ?: Exception("Failed to initialize AudioRecord with any configuration")
                    }
                } catch (e: Exception) {
                    Log.e("AsrService", "Failed to initialize AudioRecord with default configuration", e)
                    throw e
                }
            }

            // 设置音频属性
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                    .build()
                audioRecord?.setPreferredDevice(audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)?.firstOrNull())
            }

            // 启动录音前先读取一些数据来预热
            val warmupBuffer = ByteArray(actualBufferSize)
            audioRecord?.startRecording()
            audioRecord?.read(warmupBuffer, 0, actualBufferSize)
            Log.d("AsrService", "AudioRecord warmup completed")

            // 重置状态
            isRecording.set(true)
            isAlreadyDefinite = false
            currentText = ""
            startTime = System.currentTimeMillis()
            lastAsrTime = System.currentTimeMillis()
            voiceBuffer.reset()
            sequence = 0
            isSpeaking = false
            lastVoiceTime = System.currentTimeMillis()
            silenceDuration = 0

            startForeground(NOTIFICATION_ID, createNotification())

            // 开始发送音频数据
            recordingThread = Thread {
                val buffer = ByteArray(BUFFER_SIZE)
                var totalBytesRead = 0
                var lastSendTime = System.currentTimeMillis()
                var consecutiveSilenceCount = 0

                while (isRecording.get()) {
                    try {
                        val read = audioRecord?.read(buffer, 0, BUFFER_SIZE) ?: 0
                        
                        if (read > 0) {
                            totalBytesRead += read

                            // 计算音频能量值
                            var energy = 0.0
                            var maxSample = 0
                            var sampleCount = 0
                            
                            for (i in 0 until read step 2) {
                                if (i + 1 < read) {
                                    val sample = (buffer[i].toInt() and 0xFF) or (buffer[i + 1].toInt() shl 8)
                                    val signedSample = if (sample > 32767) sample - 65536 else sample
                                    if (Math.abs(signedSample) > maxSample) {
                                        maxSample = Math.abs(signedSample)
                                    }
                                    energy += signedSample * signedSample
                                    sampleCount++
                                }
                            }

                            if (sampleCount > 0) {
                                energy = Math.sqrt(energy / sampleCount)
                                
                                // 改进语音检测逻辑
                                val isVoiceDetected = energy > SILENCE_THRESHOLD || maxSample > SILENCE_THRESHOLD * 2

                                
                                if (isVoiceDetected) {
                                    consecutiveSilenceCount = 0
                                    if (!isSpeaking) {
                                        // 开始新的语音识别
                                        isSpeaking = true
                                        lastVoiceTime = System.currentTimeMillis()
                                        silenceDuration = 0
                                        voiceBuffer.reset()
                                        sequence = 0
                                        isAlreadyDefinite = false
                                        
                                        // 确保 WebSocket 连接已建立
                                        if (webSocket == null || !isInitialized.get()) {
                                            Log.d("AsrService", "Starting new WebSocket connection for speech")
                                            connectWebSocket()
                                        }
                                    }
                                    silenceDuration = 0
                                } else {
                                    consecutiveSilenceCount++
                                    if (consecutiveSilenceCount > 20) { // 增加连续静音计数阈值
                                        silenceDuration = System.currentTimeMillis() - lastVoiceTime
                                        if (silenceDuration > MIN_SILENCE_DURATION) {
                                            isSpeaking = false
                                        }
                                    }
                                }
                            }

                            // 写入数据到缓冲区
                            voiceBuffer.write(buffer, 0, read)

                            // 检查是否需要发送数据
                            val currentTime = System.currentTimeMillis()
                            val shouldSend = currentTime - lastSendTime >= SEND_INTERVAL && isSpeaking

                            if (shouldSend && isInitialized.get()) {
                                val audioData = voiceBuffer.toByteArray()
                                val isLast = !isRecording.get() || 
                                           (currentTime - lastAsrTime > FORCE_DEFINITE_DURATION && 
                                            currentText.isNotEmpty() && !isAlreadyDefinite)

                                try {
                                    val audioOnlyRequest = sendAudioOnlyRequest(audioData, isLast)
                                    val result = webSocket?.send(ByteString.of(*audioOnlyRequest))

                                    // 重置缓冲区
                                    voiceBuffer.reset()
                                    lastSendTime = currentTime

                                    if (result == true) {
                                        Log.d("AsrService", "Audio data sent successfully, size: ${audioData.size}, isLast: $isLast")
                                    } else {
                                        Log.e("AsrService", "Failed to send audio data")
                                        if (isRecording.get()) {
                                            connectWebSocket()
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e("AsrService", "Error sending audio data", e)
                                    if (isRecording.get()) {
                                        connectWebSocket()
                                    }
                                }
                            }
                        } else if (read < 0) {
                            Log.e("AsrService", "Error reading audio data: $read")
                            return@Thread
                        } else {
                            Thread.sleep(10)
                        }
                    } catch (e: Exception) {
                        Log.e("AsrService", "Error in recording thread", e)
                        stopAsr()
                        return@Thread
                    }
                }
            }.apply { start() }

        } catch (e: Exception) {
            Log.e("AsrService", "Error starting ASR", e)
            stopAsr()
        }
    }

    private fun stopAsr() {
        Log.d("stopAsr", "Stopping ASR service...")
        
        // 重置状态码重试计数
        statusCodeRetryCount = 0
        
        // 放弃音频焦点
        abandonAudioFocus()
        
        // 恢复音频设置
        audioManager?.mode = AudioManager.MODE_NORMAL
        audioManager?.isSpeakerphoneOn = true
        
        // 1. 停止录音线程
        isRecording.set(false)
        
        // 2. 等待录音线程结束
        recordingThread?.join(1000) // 最多等待1秒
        recordingThread = null
        
        // 3. 停止音频录制
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            Log.e("stopAsr", "Error stopping audio record", e)
        }
        audioRecord = null
        
        // 4. 关闭 WebSocket 连接
        try {
            webSocket?.close(1000, "Normal closure")
            // 等待一小段时间确保连接完全关闭
            Thread.sleep(100)
        } catch (e: Exception) {
            Log.e("stopAsr", "Error closing WebSocket", e)
        }
        webSocket = null
        
        // 5. 重置所有状态
        isInitialized.set(false)
        sequence = 0
        retryCount = 0
        lastVoiceTime = 0L
        silenceDuration = 0L
        
        // 6. 停止前台服务
        stopForeground(true)
        stopSelf()
        
        Log.d("stopAsr", "ASR service stopped successfully")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ASR Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("语音识别服务")
            .setContentText("正在识别语音")
            .setSmallIcon(android.R.drawable.stat_notify_call_mute)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        // 确保在服务销毁时清理 MediaPlayer
        cleanupMediaPlayer(mediaPlayer)
        stopAsr()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun sendAudioOnlyRequest(audioData: ByteArray, isLast: Boolean): ByteArray {
        sequence++
        val messageTypeSpecificFlags = if (isLast) NEG_WITH_SEQUENCE else POS_SEQUENCE
        val header = getHeader(AUDIO_ONLY_REQUEST, messageTypeSpecificFlags, JSON, GZIP, 0)
        val seqBytes = intToBytes(if (isLast) -sequence else sequence)
        val payloadBytes = gzipCompress(audioData)
        val payloadSize = intToBytes(payloadBytes.size)
        
        val audioOnlyRequest = ByteArray(header.size + seqBytes.size + payloadSize.size + payloadBytes.size)
        var destPos = 0
        System.arraycopy(header, 0, audioOnlyRequest, destPos, header.size)
        destPos += header.size
        System.arraycopy(seqBytes, 0, audioOnlyRequest, destPos, seqBytes.size)
        destPos += seqBytes.size
        System.arraycopy(payloadSize, 0, audioOnlyRequest, destPos, payloadSize.size)
        destPos += payloadSize.size
        System.arraycopy(payloadBytes, 0, audioOnlyRequest, destPos, payloadBytes.size)

        return audioOnlyRequest
    }

    private fun playAudio(base64Audio: String) {
        try {
            // 设置状态为正在播放音频
            isPlayingAudio = true
            isProcessingRequest = true

            // 保存原始音量
            originalVolume = audioManager?.getStreamVolume(AudioManager.STREAM_VOICE_CALL) ?: 0

            // 设置音频路由为听筒
            audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
            audioManager?.isSpeakerphoneOn = false

            // 降低音量
            val maxVolume = audioManager?.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL) ?: 0
            val targetVolume = (maxVolume * VOLUME_REDUCTION_FACTOR).toInt()
            audioManager?.setStreamVolume(AudioManager.STREAM_VOICE_CALL, targetVolume, 0)

            // 解码 base64 音频数据
            val audioBytes = Base64.decode(base64Audio, Base64.DEFAULT)

            // 创建临时文件
            val tempFile = File(tempAudioDir, "temp_audio_${System.currentTimeMillis()}.mp3")
            FileOutputStream(tempFile).use { outputStream ->
                outputStream.write(audioBytes)
            }

            // 释放之前的 MediaPlayer 实例
            cleanupMediaPlayer(mediaPlayer)

            // 创建新的 MediaPlayer 实例
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)  // 使用语音通信用途
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)  // 内容类型为语音
                        .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                        .build()
                )
                setDataSource(tempFile.absolutePath)
                prepareAsync()
                
                // 设置准备完成监听器
                setOnPreparedListener { mp ->
                    try {
                        mp.start()
                        Log.d("AsrService", "Audio playback started with reduced volume")
                    } catch (e: Exception) {
                        Log.e("AsrService", "Error starting audio playback", e)
                        cleanupMediaPlayer(mp)
                    }
                }
                
                // 设置错误监听器
                setOnErrorListener { mp, what, extra ->
                    Log.e("AsrService", "MediaPlayer error: what=$what, extra=$extra")
                    cleanupMediaPlayer(mp)
                    true
                }
                
                // 设置完成监听器
                setOnCompletionListener { mp ->
                    cleanupMediaPlayer(mp)
                }
            }
        } catch (e: Exception) {
            Log.e("AsrService", "Error playing audio", e)
            cleanupMediaPlayer(mediaPlayer)
        }
    }

    private fun cleanupMediaPlayer(mp: MediaPlayer?) {
        try {
            mp?.apply {
                if (isPlaying) {
                    stop()
                }
                reset()
                release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            Log.e("AsrService", "Error cleaning up MediaPlayer", e)
        } finally {
            // 重置状态
            isPlayingAudio = false
            isProcessingRequest = false
            // 恢复音频路由设置
            audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
            audioManager?.isSpeakerphoneOn = false
            // 恢复原始音量
            audioManager?.setStreamVolume(AudioManager.STREAM_VOICE_CALL, originalVolume, 0)
        }
    }

    private fun definate(text: String) {

        LAST_RESPONSE_TIME = System.currentTimeMillis();
        webSocket?.close(1000, "Normal closure")
        silenceDuration = 0
        isSpeaking = false
        webSocket = null
        isInitialized.set(false)
        isAlreadyDefinite = true
        sequence = 0
        Log.d("stop", "stopAsr了")

        if (text.isNotEmpty()){
            sendTextAsr(text)
        }

    }

    private fun sendTextAsr(text: String) {
        // 使用协程在后台线程执行网络操作
        GlobalScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            try {
                // 调用后端接口开始
                val jsonRequest = JSONObject().apply {
                    put("model", "bot-20241114164326-xlcc91")
                    put("stream", false)
                    put("messages", JSONArray().apply {
                        put(JSONObject().apply {
                            put("role", "user")
                            put("content", JSONArray().apply {
                                put(JSONObject().apply {
                                    put("type", "text")
                                    put("text", text)
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
                Log.d("AsrRequest", "AsrRequest: " + contextId)

                val response = okHttpClient.newCall(request).execute()
                val responseCode = response.code
                Log.d("TAG", "Upload response code: $responseCode")

                if (!response.isSuccessful) {
                    Log.e("TAG", "Upload failed with response code: $responseCode")
                    val errorBody = response.body?.string()
                    Log.e("TAG", "Error response: $errorBody")
                    isProcessingRequest = false
                    return@launch
                }

                val responseBody = response.body?.string()
                Log.d("TAG", "Success response received")

                // 解析响应并播放语音
                try {
                    val jsonResponse = JSONObject(responseBody)
                    val choices = jsonResponse.getJSONArray("choices")
                    if (choices.length() > 0) {
                        val firstChoice = choices.getJSONObject(0)
                        val message = firstChoice.getJSONObject("message")
                        val audio = message.optJSONObject("audio")
                        if (audio != null) {
                            val audioData = audio.optString("data")
                            if (audioData.isNotEmpty()) {
                                // 截断音频数据用于日志显示
                                val truncatedAudio =
                                    if (audioData.length > 20) {
                                        audioData.substring(0, 20) + "..."
                                    } else {
                                        audioData
                                    }
                                Log.d(
                                    "TAG",
                                    "Audio data length: ${audioData.length}, content: $truncatedAudio"
                                )
                                // 在主线程播放音频
                                withContext(kotlinx.coroutines.Dispatchers.Main) {
                                    playAudio(audioData)
                                }
                            } else {
                                // 如果没有音频数据，直接重置处理状态
                                isProcessingRequest = false
                            }
                        } else {
                            // 如果没有音频对象，直接重置处理状态
                            isProcessingRequest = false
                        }
                    } else {
                        // 如果没有选择，直接重置处理状态
                        isProcessingRequest = false
                    }
                } catch (e: Exception) {
                    Log.e("AsrService", "Error parsing response", e)
                    isProcessingRequest = false
                }
            } catch (e: Exception) {
                Log.e("AsrService", "Error in sendTextAsr", e)
                isProcessingRequest = false
            }
        }
    }

    private fun parseResponse(res: ByteArray): Int {
        if (res.isEmpty()) {
            return -1
        }
        
        val num = 0b00001111
        val result = HashMap<String, Any>()
        
        val protocolVersion = (res[0].toInt() ushr 4) and num
        result["protocol_version"] = protocolVersion
        val headerSize = res[0].toInt() and 0x0f
        result["header_size"] = headerSize
        
        val messageType = (res[1].toInt() ushr 4) and num
        result["message_type"] = messageType
        val messageTypeSpecificFlags = res[1].toInt() and 0x0f
        result["message_type_specific_flags"] = messageTypeSpecificFlags
        val serializationMethod = res[2].toInt() ushr num
        result["serialization_method"] = serializationMethod
        val messageCompression = res[2].toInt() and 0x0f
        result["message_compression"] = messageCompression
        val reserved = res[3]
        result["reserved"] = reserved
        
        val temp = ByteArray(4)
        System.arraycopy(res, 4, temp, 0, temp.size)
        val sequence = bytesToInt(temp)

        Log.i("hg", "seq: "+sequence)

        if (sequence == 45000081){
            definate(currentText)
            return sequence
        }
        if(sequence < 0){
            Log.i("AsrService", "Received status code 45000081, reconnecting...")
            // 关闭当前连接
            webSocket?.close(1000, "Reconnecting due to status code -")
            // 重置状态
            isInitialized.set(false)
            isConnecting.set(false)
            isSpeaking = false
            return sequence
        }
        
        System.arraycopy(res, 8, temp, 0, temp.size)
        val payloadSize = bytesToInt(temp)
        val payload = ByteArray(res.size - 12)
        System.arraycopy(res, 12, payload, 0, payload.size)

        Log.i("AsrService", "messageType: $messageType")

        if (messageType == FULL_SERVER_RESPONSE || messageType == SERVER_ACK) {
            val payloadStr = if (messageCompression == GZIP) {
                String(gzipDecompress(payload))
            } else {
                String(payload)
            }
            Log.d("AsrService", "Payload: $payloadStr")
            result["payload_size"] = payloadSize
            Log.d("AsrService", "Response: ${Gson().toJson(result)}")

            try {
                val jsonResponse = JSONObject(payloadStr)

                // 检查是否是初始化响应
                if (messageType == FULL_SERVER_RESPONSE) {
                    Log.d("AsrService", "Received server response")
                    isInitialized.set(true)
                }

                var text = ""
                // 检查是否有识别结果
                if (jsonResponse.has("result")) {
                    // 只要有结果，就应该设置isSpeak = false
                    val result = jsonResponse.getJSONObject("result")

                    if (result.has("text")) {
                        text = result.getString("text")
                        if (text.isNotEmpty()) {
                            Log.d("AsrService", "Recognized text: $text")
                            currentText = text
                            lastAsrTime = System.currentTimeMillis()
                        } else {
                            Log.d("AsrService", "Empty text in response")
                        }
                    } else {
                        Log.d("AsrService", "No text field in result")
                    }
                    if(jsonResponse.getJSONObject("result").has("utterances") && 
                       jsonResponse.getJSONObject("result").getJSONArray("utterances").length()>0){
                        var definiteFlag = jsonResponse.getJSONObject("result")
                            .getJSONArray("utterances")
                            .getJSONObject(0)
                            .getBoolean("definite")
                        if(definiteFlag){
                            definate(text)
                        }
                    }
                } else {
                    Log.d("AsrService", "No result field in response")
                }
            } catch (e: Exception) {
                Log.e("AsrService", "Error parsing ASR result", e)
            }
        }

        return sequence
    }

    private fun bytesToInt(src: ByteArray): Int {
        if (src.size != 4) {
            throw IllegalArgumentException("Invalid byte array size")
        }
        return ((src[0].toInt() and 0xFF) shl 24) or
                ((src[1].toInt() and 0xFF) shl 16) or
                ((src[2].toInt() and 0xFF) shl 8) or
                (src[3].toInt() and 0xFF)
    }

    private fun gzipDecompress(src: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        val ins = ByteArrayInputStream(src)
        val gzip = GZIPInputStream(ins)
        val buffer = ByteArray(ins.available())
        var len = 0
        while (gzip.read(buffer).also { len = it } > 0) {
            out.write(buffer, 0, len)
        }
        out.close()
        return out.toByteArray()
    }
}

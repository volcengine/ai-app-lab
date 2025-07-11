package com.bytedance.ai.multimodal.demo.page.speech

import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.bytedance.ai.multimodal.asr.api.ASRManager
import com.bytedance.ai.multimodal.asr.api.ASRResultCallback
import com.bytedance.ai.multimodal.asr.api.record.AudioRecorder
import com.bytedance.ai.multimodal.asr.api.record.IAudioConsumer
import com.bytedance.ai.multimodal.common.base.DummyStreamingString
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.demo.core.permission.PermissionManager
import com.bytedance.ai.multimodal.tts.api.TTSService
import com.bytedance.ai.multimodal.tts.api.TTSStatusChangeListener
import com.hjq.permissions.Permission

class SpeechActivity : AppCompatActivity() {

    private lateinit var textViewResult: TextView
    private lateinit var buttonStartAsr: Button
    private lateinit var buttonStopAsr: Button
    private lateinit var buttonStartTts: Button

    private val TAG = "SpeechActivity"

    private val asrResultListener = object : ASRResultCallback {
        override fun onFinalResult(result: String) {
            Log.d(TAG, "ASR Final Result: $result")
            runOnUiThread {
                textViewResult.append("\nASR Final Result: $result")
            }
        }

        override fun onReceiving(totalText: String) {
            Log.d(TAG, "ASR Receiving: $totalText")
            runOnUiThread {
                textViewResult.append("\nASR Receiving: $totalText")
            }
        }

        override fun onError(errorCode: Int, errorMsg: String, taskId: String) {
            Log.e(TAG, "ASR Error: $errorCode, $errorMsg, TaskId: $taskId")
            runOnUiThread {
                textViewResult.append("\nASR Error: $errorMsg")
                Toast.makeText(this@SpeechActivity, "ASR Error: $errorMsg", Toast.LENGTH_SHORT).show()
            }
        }

        override fun onASRStart(taskId: String) {
            Log.d(TAG, "ASR Started, TaskId: $taskId")
            runOnUiThread {
                textViewResult.append("\nASR Service Started")
            }
        }

        override fun onASRStop(taskId: String, sosTimeout: Boolean) {
            Log.d(TAG, "ASR Stopped, TaskId: $taskId, SOSTimeout: $sosTimeout")
            runOnUiThread {
                textViewResult.append("\nASR Service Stopped")
            }
        }
    }

    private val ttsStatusChangeListener = object : TTSStatusChangeListener {
        override fun onPlayStart(taskId: String) {
            Log.d(TAG, "TTS Play Start, TaskId: $taskId")
            runOnUiThread {
                textViewResult.append("\nTTS Play Start")
            }
        }

        override fun onPlayFinished() {
            Log.d(TAG, "TTS Play Finished")
            runOnUiThread {
                textViewResult.append("\nTTS Play Finished")
            }
        }

        override fun onPlayError(errorCode: Int, error: String, taskId: String) {
            Log.e(TAG, "TTS Play Error: $errorCode, $error, TaskId: $taskId")
            runOnUiThread {
                textViewResult.append("\nTTS Play Error: $error")
                Toast.makeText(this@SpeechActivity, "TTS Error: $error", Toast.LENGTH_SHORT).show()
            }
        }

        override fun onSentencePlayStart(text: String) {
            Log.d(TAG, "TTS Sentence Play Start: $text")
            runOnUiThread {
                textViewResult.append("\nTTS Sentence Play Start: $text")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_speech)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }

        textViewResult = findViewById(R.id.textViewResult)
        buttonStartAsr = findViewById(R.id.buttonStartAsr)
        buttonStopAsr = findViewById(R.id.buttonStopAsr)
        buttonStartTts = findViewById(R.id.buttonStartTts)

        // 应用已经在VolcEngineApp完成初始化，无需再次初始化
        // Initialize ASR
//        val asrConfig = ASRConfig(
//            url = "YOUR_ASR_SERVICE_URL", // Replace with your ASR service URL
//            appKeyFetcher = {
//                "YOUR_ASR_APP_KEY" // Replace with your ASR App Key
//            },
//            sampleRate = 24000,
//            tokenFetcher = {
//                "YOUR_ASR_TOKEN" // Replace with your ASR Token
//            }
//        )
//        MultimodalKit.enableASR(AsrServiceWithVolcengine(), asrConfig)
//
//        // Initialize TTS
//        val ttsConfig = TTSConfig(
//            url = "YOUR_TTS_SERVICE_URL", // Replace with your TTS service URL
//            appKeyFetcher = {
//                "YOUR_TTS_APP_KEY" // Replace with your TTS App Key
//            },
//            sampleRate = 24000,
//            format = "pcm",
//            speechRate = 15,
//            tokenFetcher = {
//                return@TTSConfig "YOUR_TTS_TOKEN" // Replace with your TTS Token
//            },
//            defaultSpeaker = "zh_female_tianmeixiaoyuan_moon_bigtts"
//        )
//        MultimodalKit.enableTTS(VolcengineTTSServiceImpl(), ttsConfig)

        buttonStartAsr.setOnClickListener {
            textViewResult.text = "Starting ASR..."
            ASRManager.registerAsrResultCallback(asrResultListener)
            // Optional audio consumer
            val audioConsumer = object: IAudioConsumer {
                override fun consume(audioData: ByteArray, offset: Int, length: Int) {
                    // Log.v(TAG, "ASR Audio Data Consumed: $length bytes")
                }
            }
            //必须先申请录音权限
            PermissionManager.requestPermission(Permission.RECORD_AUDIO, object : PermissionManager.RequestPermissionCallback{
                override fun onResult(
                    grantedPermissions: List<String>,
                    result: Boolean
                ) {
                    if (result) {
                        ASRManager.start(
                            AudioRecorder(),
                            audioConsumer, // Can be null
                            1000, //eos超时时间
                            10000 //sos超时时间
                        )
                    } else {
                        Toast.makeText(this@SpeechActivity, "Permission denied", Toast.LENGTH_SHORT).show()
                    }
                }
            })
        }

        buttonStopAsr.setOnClickListener {
            textViewResult.append("\nStopping ASR...")
            ASRManager.unregisterAsrResultCallback(asrResultListener)
            ASRManager.release()
            textViewResult.append("\nASR stopped...")
        }

        buttonStartTts.setOnClickListener {
            val textToPlay = "你好，欢迎使用语音合成服务。"
            textViewResult.text = "Starting TTS with text: $textToPlay"

             val streamingText = DummyStreamingString(textToPlay)
             TTSService.getInstance().playStreaming(streamingText, listener = ttsStatusChangeListener)
        }

        // Setup Toolbar back button
        val toolbar: androidx.appcompat.widget.Toolbar = findViewById(R.id.toolbarSpeech)
        toolbar.setNavigationOnClickListener {
            finish()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Clean up ASR resources if not already stopped
        if (ASRManager.isInit()) {
            ASRManager.unregisterAsrResultCallback(asrResultListener)
            ASRManager.release()
        }
        // Clean up TTS resources
        TTSService.getInstance().stop()
    }
}
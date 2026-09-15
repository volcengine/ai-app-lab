package com.example.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.android.service.ScreenshotService
import com.example.android.service.AsrService
import com.example.android.ui.theme.AndroidTheme
import com.example.android.utils.PermissionUtils
import kotlinx.coroutines.*
import java.util.UUID

class MainActivity : ComponentActivity() {
    companion object {
        private const val TAG = "MainActivity"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
    }
    private var isRecording = false
    private var showPermissionDialog = mutableStateOf(false)
    private var permissionDialogMessage = mutableStateOf("")
    private var showSettingsButton = mutableStateOf(false)
    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private var isAsrRecording = false
    private var asrResult = ""
    private var asrAccessToken = ""
    private var asrAppId = ""
    private var server_ip = ""
    private var context_id = ""
    private var isRequestingAudioPermission = false
    private var isRequestingScreenPermission = false

    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        isRequestingScreenPermission = false
        if (result.resultCode == RESULT_OK) {
            Log.d(TAG, "Screen capture result: ${result.resultCode}")
            startRecording(result.resultCode, result.data)
            // 屏幕录制权限已授予，启动 ASR 服务
            startAsr()
            isRecording = true
        } else {
            // 屏幕录制权限被拒绝
            showPermissionDialog.value = true
            permissionDialogMessage.value = "需要屏幕录制权限才能使用截图功能"
            showSettingsButton.value = true
        }
    }


    private val asrReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.example.android.ASR_RESULT") {
                val text = intent.getStringExtra("text") ?: ""
                asrResult = text
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AndroidTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var isRecording by remember { mutableStateOf(false) }
                    var asrResult by remember { mutableStateOf("") }
                    var asrAccessToken by remember { mutableStateOf("") }
                    var asrAppId by remember { mutableStateOf("") }
                    var server_ip by remember { mutableStateOf("") }

                    // 同步状态变量
                    LaunchedEffect(asrAccessToken, asrAppId, server_ip) {
                        this@MainActivity.asrAccessToken = asrAccessToken
                        this@MainActivity.asrAppId = asrAppId
                        this@MainActivity.server_ip = server_ip
                    }

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = "HGDoll",
                            fontSize = 32.sp,
                            style = MaterialTheme.typography.headlineLarge.copy(
                                brush = Brush.linearGradient(
                                    colors = listOf(
                                        Color(0xFFE91E63),  // 粉色
                                        Color(0xFF2196F3),  // 蓝色
                                        Color(0xFF4CAF50),  // 绿色
                                        Color(0xFFFFC107)   // 黄色
                                    )
                                )
                            ),
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )

                        Text(
                            text = "基于豆包系列大模型打造的 AI 开源应用",
                            fontSize = 16.sp,
                            color = Color.Gray,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(bottom = 32.dp)
                        )
                        Button(
                            onClick = {
                                if (isRecording) {
                                    Log.d(TAG, "Stopping recording with context_id: $context_id")
                                    stopRecording()
                                    stopAsr()
                                    context_id = ""
                                    isRecording = false
                                } else {
                                    context_id = if (context_id.isEmpty()) {
                                        UUID.randomUUID().toString()
                                    } else {
                                        context_id
                                    }
                                    Log.d(TAG, "Generated new context_id: $context_id")
                                    // 有权限，启动服务
                                    startRecording()
                                    startAsr()
                                    isRecording = true
                                }
                            }
                        ) {
                            Text(if (isRecording) "停止录制" else "开始录制")
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        OutlinedTextField(
                            value = asrAccessToken,
                            onValueChange = { asrAccessToken = it },
                            label = { Text("ASR Access Token") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation()
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = asrAppId,
                            onValueChange = { asrAppId = it },
                            label = { Text("ASR App ID") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation()
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        OutlinedTextField(
                            value = server_ip,
                            onValueChange = { server_ip = it },
                            label = { Text("Server IP") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )

                        if (asrResult.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "识别结果：$asrResult",
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(
                asrReceiver,
                IntentFilter("com.example.android.ASR_RESULT"),
                Context.RECEIVER_NOT_EXPORTED
            )
        }
    }


    override fun onResume() {
        super.onResume()
        if (showSettingsButton.value) {
            showSettingsButton.value = false
            checkAndRequestPermissions()
        }
    }

    private fun checkAndRequestPermissions() {
        if (!PermissionUtils.hasAllPermissions(this)) {
            isRequestingAudioPermission = true
            requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 1)
            return
        }
        // 录音权限已授予，申请屏幕录制权限
        requestScreenCapturePermission()
    }

    private fun requestScreenCapturePermission() {
        try {
            val projectionManager = getSystemService(MediaProjectionManager::class.java)
            val captureIntent = projectionManager.createScreenCaptureIntent()
            Log.d(TAG, "Launching screen capture intent...")
            isRequestingScreenPermission = true
            mediaProjectionLauncher.launch(captureIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting capture", e)
            showPermissionDialog.value = true
            permissionDialogMessage.value = "启动屏幕截图失败，请重试"
            showSettingsButton.value = false
        }
    }

    private fun startRecording(resultCode: Int? = null, data: Intent? = null) {
        Log.d(TAG, "Starting recording with context_id: $context_id")
        Log.d(TAG, "Starting work...")
        
        if (resultCode == null) {
            // 直接调用权限检查
            checkAndRequestPermissions()
            return
        }

        try {
            // 启动截图服务
            val screenshotIntent = Intent(this, ScreenshotService::class.java).apply {
                action = ScreenshotService.ACTION_START
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, data)
                putExtra(ScreenshotService.SERVER_IP, server_ip)
                putExtra(ScreenshotService.CONTEXT_ID, context_id)
            }
            ContextCompat.startForegroundService(this, screenshotIntent)
            Log.d(TAG, "Screenshot service started")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting capture", e)
            showPermissionDialog.value = true
            permissionDialogMessage.value = "启动录制失败，请重试"
            showSettingsButton.value = false
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            1 -> {
                isRequestingAudioPermission = false
                if (grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    // 录音权限已授予，申请屏幕录制权限
                    requestScreenCapturePermission()
                } else {
                    // 权限被拒绝
                    showPermissionDialog.value = true
                    permissionDialogMessage.value = "需要录音权限才能使用语音识别功能"
                    showSettingsButton.value = true
                }
            }
        }
    }

    private fun stopRecording() {
        Log.d(TAG, "Stopping capture...")
        isRecording = false
        
        try {
            // 停止截图服务
            val screenshotIntent = Intent(this, ScreenshotService::class.java).apply {
                action = ScreenshotService.ACTION_STOP
            }
            startService(screenshotIntent)
            Log.d(TAG, "Screenshot service stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping capture", e)
            showPermissionDialog.value = true
            permissionDialogMessage.value = "停止录制失败，请重试"
            showSettingsButton.value = false
        }
    }


    private fun startAsr() {
        Log.d(TAG, "Starting ASR with context_id: $context_id")
        // 不再检查权限，因为权限检查已经在 checkAndRequestPermissions 中处理
        val intent = Intent(this, AsrService::class.java).apply {
            action = AsrService.ACTION_START
            putExtra(AsrService.EXTRA_ACCESS_TOKEN, asrAccessToken)
            putExtra(AsrService.EXTRA_APP_ID, asrAppId)
            putExtra(AsrService.SERVER_IP, server_ip)
            putExtra(AsrService.CONTEXT_ID, context_id)
        }
        ContextCompat.startForegroundService(this, intent)
        isAsrRecording = true
    }

    private fun stopAsr() {
        val intent = Intent(this, AsrService::class.java).apply {
            action = AsrService.ACTION_STOP
        }
        startService(intent)
        isAsrRecording = false
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        unregisterReceiver(asrReceiver)
    }
}

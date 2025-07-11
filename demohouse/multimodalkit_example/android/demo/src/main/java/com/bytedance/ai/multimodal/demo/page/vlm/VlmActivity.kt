package com.bytedance.ai.multimodal.demo.page.vlm

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.bytedance.ai.multimodal.common.base.FunctionCallCallback
import com.bytedance.ai.multimodal.common.base.StreamingStringCallback
import com.bytedance.ai.multimodal.common.base.VisualImageObject
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.vlm.api.VLMChatProvider
import com.bytedance.ai.multimodal.vlm.api.extension.extension
import com.bytedance.ai.multimodal.vlm.api.tools.ToolCall
import com.bytedance.ai.multimodal.vlm.api.tools.ToolFunction
import com.bytedance.ai.multimodal.vlm.api.tools.ToolFunction.Input
import com.google.gson.JsonObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class VlmActivity : AppCompatActivity() {

    private lateinit var editTextVlmInput: EditText
    private lateinit var textViewVlmOutput: TextView
    private lateinit var buttonNonStreamingSend: Button
    private lateinit var buttonStreamingSend: Button
    private lateinit var toolbar: Toolbar
    private lateinit var switchShowToast: androidx.appcompat.widget.SwitchCompat

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_vlm)

        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        toolbar.setNavigationOnClickListener {
            onBackPressedDispatcher.onBackPressed()
        }

        editTextVlmInput = findViewById(R.id.editTextVlmInput)
        textViewVlmOutput = findViewById(R.id.textViewVlmOutput)
        buttonNonStreamingSend = findViewById(R.id.buttonNonStreamingSend)
        buttonStreamingSend = findViewById(R.id.buttonStreamingSend)
        switchShowToast = findViewById(R.id.switchShowToast)

        switchShowToast.setOnCheckedChangeListener { _, isChecked ->
            buttonNonStreamingSend.isEnabled = !isChecked
            if (isChecked) {
                editTextVlmInput.setText("打印一个 Toast 显示 Hello world")
            }
        }

        // 应用已经在VolcEngineApp完成初始化，无需再次初始化
        // Initialize MultimodalKit for VLM
        // 请将 "YOUR_ENDPOINT" 和 "YOUR_API_KEY" 替换为您的实际端点和API密钥
//        val vlmConfig = VLMArkConfig(
//            endPoint = "YOUR_ENDPOINT", // 替换为您的节点信息
//            host = "https://ark.cn-beijing.volces.com",
//            apiKey = "YOUR_API_KEY" // 替换为您的API Key
//        )
//        MultimodalKit.initGlobalVLM(VLMArkService(), vlmConfig)


        // Optionally create a specific instance if not using global
        // val vlmChat = VLMChatProvider.createArkVLMChat(vlmConfig)

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            // Adjust padding for the main content area below the toolbar
            // The toolbar itself will handle its own padding if fitsSystemWindows is true or through other means
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }

        buttonNonStreamingSend.setOnClickListener {
            val inputText = editTextVlmInput.text.toString()
            if (inputText.isNotBlank()) {
                sendNonStreamingRequest(inputText)
            } else {
                Toast.makeText(this, "请输入内容", Toast.LENGTH_SHORT).show()
            }
        }

        buttonStreamingSend.setOnClickListener {
            val inputText = editTextVlmInput.text.toString()
            if (inputText.isNotBlank()) {
                sendStreamingRequest(inputText)
            } else {
                Toast.makeText(this, "请输入内容", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun sendNonStreamingRequest(input: String) {
        textViewVlmOutput.text = "正在请求..."
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = VLMChatProvider.globalVlmChat?.extension()?.send(
                    systemPrompt = "你是火山引擎豆包大模型，请你扮演一个助手回答用户的各种问题", // 根据需要设置系统提示
                    input = input,
                    bitmapList = emptyList() // 非流式请求通常不支持tools，移除相关逻辑
                )
                withContext(Dispatchers.Main) {
                    // 非流式请求不支持tool call，直接显示回复
                    textViewVlmOutput.text = response?.toString() ?: "未收到回复或发生错误"
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    textViewVlmOutput.text = "请求失败: ${e.message}"
                    e.printStackTrace()
                }
            }
        }
    }

    private fun sendStreamingRequest(input: String) {
        textViewVlmOutput.text = "" // Clear previous output
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = VLMChatProvider.globalVlmChat?.extension()?.sendStreaming(
                    systemPrompt = "", // 根据需要设置系统提示
                    input = input,
                    bitmapList = emptyList(), // 如果需要，添加图片列表
                    tools = if (switchShowToast.isChecked) listOf(createShowToastTool()) else null
                )

                response?.onStreamingString(object : StreamingStringCallback {
                    override fun callback(totalText: String, newText: String, isFinish: Boolean) {
                        runOnUiThread {
                            textViewVlmOutput.text = totalText
                        }
                    }
                })
                response?.onFunctionCall(object :FunctionCallCallback {
                    override fun onFunctionCall(name: String, arguments: String) {
                        //name 对应
                        //arguments 是 json 格式，需自行解析入参
                        if (name == "show_toast") {
                            val message = arguments.let { JSONObject(it).optString("message") }
                                ?: "Default Toast Message from Streaming"
                            showToast(message)
                            textViewVlmOutput.append("\nTool call: showToast executed with message: $message")
                        }
                    }
                })

                // Ensure the stream starts if it's a cold start or needs explicit invocation
                // Some SDKs might require an explicit call to start consuming the stream, e.g., response?.start()
                // Based on the provided doc, onStreamingString seems to be the primary way to get data.

            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    textViewVlmOutput.text = "流式请求失败: ${e.message}"
                    e.printStackTrace()
                }
            }
        }
    }

    private fun createShowToastTool(): ToolCall {
        return ToolCall(
            ToolFunction(
                name = "show_toast",
                description = "Displays a toast message on the screen.",
                parameters = Input(
                    properties = JsonObject().apply {
                        this.add("message", JsonObject().apply {
                            this.addProperty("type", "string")
                            this.addProperty("description", "The message to display in the toast.")
                        })
                    },
                    required = listOf("message")
                )
            )
        )
    }

    private fun showToast(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
    }
}
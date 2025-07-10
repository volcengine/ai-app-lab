package com.bytedance.ai.multimodal.shopping.page.hybrid.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.bytedance.ai.bridge.AIBridge
import com.bytedance.ai.multimodal.bridge.web.WebViewBridgePort
import com.bytedance.ai.multimodal.shopping.AppCore
import com.bytedance.ai.multimodal.shopping.databinding.ActivityMultimodalWebBinding
import kotlinx.coroutines.launch

class MultimodalWebActivity : AppCompatActivity() {

    companion object{
        private const val TAG = "MultimodalWebActivity"
        internal const val EXTRA_URL = "extra_url"
        internal const val IMAGE_ID = "image_id"

        fun startActivity(context: Context, url: String?, queryMap: Map<String, String>? = null) {
            context.startActivity(Intent(context, MultimodalWebActivity::class.java).apply {
                queryMap?.entries?.forEach { (key, value) ->
                    putExtra(key, value)
                }
                putExtra(EXTRA_URL, url)
            })
        }
    }

    private val aiBridge = AIBridge()

    private lateinit var binding: ActivityMultimodalWebBinding

    private  val viewModal: MultimodalViewModal by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMultimodalWebBinding.inflate(layoutInflater)
        setContentView(binding.root)
        initData()
        initViews()
        initObservers()
    }

    private fun initData(){
        viewModal.initData(intent)
    }

    private fun initViews(){
        setupWebView()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        binding.apply {
            if (AppCore.isLocalTestOrDebug()) {
                WebView.setWebContentsDebuggingEnabled(true)
            }
            webPage.settings.javaScriptEnabled = true
            webPage.settings.allowFileAccess = true
            WebViewBridgePort.create(webPage)?.let { aiBridge.start(it) }
            webPage.webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    Log.e(TAG,"onReceivedError error code: ${error?.errorCode}, description: ${error?.description}")
                }
            }
        }
    }

    private fun initObservers(){
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModal.urlState.collect {
                    binding.webPage.loadUrl(it)
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        aiBridge.release()
    }
}
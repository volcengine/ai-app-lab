package com.bytedance.ai.multimodal.demo.page.main

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.bytedance.ai.multimodal.demo.page.realtime.RealtimeActivity
import com.bytedance.ai.multimodal.demo.page.settings.SettingsActivity
import com.bytedance.ai.multimodal.demo.page.speech.SpeechActivity
import com.bytedance.ai.multimodal.demo.page.vlm.VlmActivity
import com.bytedance.ai.multimodal.demo.R

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
    }

    fun startBridgeTest(view: View) {
        startActivity(Intent(this, SettingsActivity::class.java))
    }
    fun startRealtimeTest(view: View) {
        startActivity(Intent(this, RealtimeActivity::class.java))
    }
    fun startSpeechTest(view: View) {
        startActivity(Intent(this, SpeechActivity::class.java))
    }
    fun startVLMTest(view: View) {
        startActivity(Intent(this, VlmActivity::class.java))
    }
}
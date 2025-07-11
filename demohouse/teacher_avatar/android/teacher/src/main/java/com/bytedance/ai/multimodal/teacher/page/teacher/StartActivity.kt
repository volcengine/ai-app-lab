package com.bytedance.ai.multimodal.teacher.page.teacher

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import com.bytedance.ai.multimodal.teacher.R

class StartActivity : AppCompatActivity() {

    companion object {
        private const val DELAY_MILLIS = 2000L // 启动页显示2秒
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_start)

        // 延迟后跳转到主页面
        Handler(Looper.getMainLooper()).postDelayed({
            startMainActivity()
        }, DELAY_MILLIS)
    }

    private fun startMainActivity() {
        // 跳转到主页面
        val intent = Intent(this, TeacherCameraActivity::class.java)
        startActivity(intent)
        finish() // 结束启动页，防止返回
    }
}
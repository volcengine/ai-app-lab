package com.bytedance.ai.multimodal.demo.page.realtime

import android.os.Bundle
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.demo.databinding.ActivityMainCameraBinding
import com.bytedance.ai.multimodal.demo.view.fragments.PopupContainerFragment
import com.gyf.immersionbar.ImmersionBar

class RealtimeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainCameraBinding
    private val cameraModeViewModel: CameraViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        ImmersionBar.with(this).init()

        supportFragmentManager.beginTransaction()
            .replace(R.id.container, PopupContainerFragment())
            .commitAllowingStateLoss()

        //默认进入实时对话界面
        cameraModeViewModel.presenterLiveData.value = RealtimePresenter()
    }
}
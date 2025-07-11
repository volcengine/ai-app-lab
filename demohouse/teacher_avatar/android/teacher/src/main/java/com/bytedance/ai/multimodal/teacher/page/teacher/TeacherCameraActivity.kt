package com.bytedance.ai.multimodal.teacher.page.teacher

import android.os.Bundle
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.bytedance.ai.multimodal.teacher.R
import com.bytedance.ai.multimodal.teacher.databinding.ActivityMainCameraBinding
import com.bytedance.ai.multimodal.teacher.page.realtime.CameraViewModel
import com.bytedance.ai.multimodal.teacher.view.fragments.PopupContainerFragment
import com.bytedance.ai.multimodal.teacher.view.popup.base.AbsPopupPresenter
import com.gyf.immersionbar.ImmersionBar

class TeacherCameraActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainCameraBinding
    private val cameraModeViewModel: CameraViewModel by viewModels()

    private var isFirstShow = true

    private var currentPresenter: AbsPopupPresenter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        ImmersionBar.with(this).init()

        supportFragmentManager.beginTransaction()
            .replace(R.id.container, PopupContainerFragment())
            .commitAllowingStateLoss()

        //默认进入Idle界面
        cameraModeViewModel.presenterLiveData.value = TeacherPresenter()
        cameraModeViewModel.presenterLiveData.observe(this) {
            currentPresenter = it
            //回到Idle的时候弹出评分反馈弹窗
            if (it is TeacherPresenter) {
                if (isFirstShow) {
                    isFirstShow = false
                    return@observe
                }
            }
        }
    }
}
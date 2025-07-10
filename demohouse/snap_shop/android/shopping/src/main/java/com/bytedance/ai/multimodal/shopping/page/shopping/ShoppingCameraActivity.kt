package com.bytedance.ai.multimodal.shopping.page.shopping

import android.os.Bundle
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.bytedance.ai.multimodal.shopping.R
import com.bytedance.ai.multimodal.shopping.databinding.ActivityMainCameraBinding
import com.bytedance.ai.multimodal.shopping.page.shopping.viewmodel.CameraViewModel
import com.bytedance.ai.multimodal.shopping.view.fragments.PopupContainerFragment
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsPopupPresenter
import com.gyf.immersionbar.ImmersionBar

class ShoppingCameraActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainCameraBinding
    private val shoppingCameraViewModel: CameraViewModel by viewModels()

    private var currentPresenter: AbsPopupPresenter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainCameraBinding.inflate(layoutInflater)
        setContentView(binding.root)

        ImmersionBar.with(this).init()

        supportFragmentManager.beginTransaction()
            .replace(R.id.container, PopupContainerFragment())
            .commitAllowingStateLoss()

        shoppingCameraViewModel.setPresenter(ShoppingPresenter())
        shoppingCameraViewModel.presenterLiveData.observe(this) {
            currentPresenter = it
        }
    }
}
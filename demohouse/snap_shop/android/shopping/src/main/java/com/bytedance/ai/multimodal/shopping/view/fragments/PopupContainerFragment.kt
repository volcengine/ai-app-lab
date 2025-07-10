package com.bytedance.ai.multimodal.shopping.view.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.addCallback
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import com.bytedance.ai.multimodal.common.log.FLogger
import com.bytedance.ai.multimodal.common.utils.ScreenUtils.getScreenHeight
import com.bytedance.ai.multimodal.common.utils.gone
import com.bytedance.ai.multimodal.common.utils.visible
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsBottomSheetFragment
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsOverlayFragment
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsPopupPresenter
import com.bytedance.ai.multimodal.shopping.R
import com.bytedance.ai.multimodal.shopping.databinding.FragmentPopupContainerBinding
import com.bytedance.ai.multimodal.shopping.page.shopping.viewmodel.CameraViewModel
import com.google.android.material.bottomsheet.BottomSheetBehavior

class PopupContainerFragment: Fragment() {

    private val TAG = "PopupContainerFragment"

    private lateinit var binding: FragmentPopupContainerBinding

    private var overlayFragment: AbsOverlayFragment? = null

    private var subFragment: AbsBottomSheetFragment? = null

    private val viewModel: CameraViewModel by activityViewModels()

    private var firstPresenter: AbsPopupPresenter? = null

    private var currentPresenter: AbsPopupPresenter? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {

        binding = FragmentPopupContainerBinding.inflate(layoutInflater)

        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        viewModel.presenterLiveData.observe(this.viewLifecycleOwner) {
            if (firstPresenter == null) {
                firstPresenter = it
            }
            currentPresenter = it
            FLogger.i(TAG, "change mode to $it")
            initView(it)
        }
        viewModel.popupCallbackLiveData.observe(this.viewLifecycleOwner) {
            val bottomSheetBehavior = BottomSheetBehavior.from(binding.popupContainer)
            it?.onInit(bottomSheetBehavior.peekHeight)
            subFragment?.setBottomSheetCallback(it)
        }
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        requireActivity().onBackPressedDispatcher.addCallback {
            if (firstPresenter != currentPresenter) {
                viewModel.presenterLiveData.value = firstPresenter
            } else {
                isEnabled = false // 禁用当前回调，让 Activity 处理全局回退
                activity?.onBackPressed() // 或直接关闭当前 Fragment
            }
        }
    }

    private fun initView(presenter: AbsPopupPresenter) {
        val bottomSheetBehavior = BottomSheetBehavior.from(binding.popupContainer)
        bottomSheetBehavior.state = BottomSheetBehavior.STATE_COLLAPSED

        val fragmentTransaction = childFragmentManager.beginTransaction()

        /**---------画面源Fragment---------*/
        val overlayFragment = presenter.getOverlayFragment()
        this.overlayFragment = overlayFragment

        val cameraContainerFragment = childFragmentManager.findFragmentById(R.id.main_container) as CameraContainerFragment
        cameraContainerFragment.setOverlayFragment(overlayFragment)
        cameraContainerFragment.setCameraPreview(overlayFragment.isCameraPreviewEnable())

        binding.operationContainer.removeAllViews()
        presenter.initOperationContainer(binding.operationContainer)

        /**---------底部弹窗Fragment（可能不存在）---------*/
        val subFragment = presenter.getBottomSheetFragment()
        if (subFragment == null) {
            this.subFragment?.apply { fragmentTransaction.remove(this) }
            fragmentTransaction
                .commitAllowingStateLoss()
            binding.popupContainer.gone()
            return
        }

        subFragment.lifecycle.addObserver(object : LifecycleEventObserver {
            override fun onStateChanged(source: LifecycleOwner, event: Lifecycle.Event) {
                if (event == Lifecycle.Event.ON_DESTROY) {
                    binding.popupContainer.gone()
                    source.lifecycle.removeObserver(this)
                } else if (event == Lifecycle.Event.ON_CREATE) {
                    binding.popupContainer.visible()
                }
            }
        })
        this.subFragment = subFragment

        fragmentTransaction
            .replace(R.id.popup_container, subFragment)
            .commitAllowingStateLoss()

        subFragment.arguments = arguments

        // 设置最大上升高度为屏幕高度的70%
        val maxHeight = (getScreenHeight(context) * 0.7).toInt()
        binding.popupContainer.layoutParams.height = maxHeight

        subFragment.bindBehavior(bottomSheetBehavior)
    }

}
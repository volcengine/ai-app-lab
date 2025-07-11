package com.bytedance.ai.multimodal.demo.view.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.demo.databinding.FragmentCameraContainerBinding

class CameraContainerFragment : Fragment() {

    private lateinit var binding: FragmentCameraContainerBinding
    private lateinit var previewFragment: Fragment
    private var overlayFragment: Fragment? = null

    @Volatile
    private var isInit: Boolean = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentCameraContainerBinding.inflate(inflater)

        addOverlayFragment()
        return binding.root
    }

    fun setOverlayFragment(imageSourceFragment: Fragment) {
        overlayFragment = imageSourceFragment
        if (isAdded) {
            addOverlayFragment()
        }
    }

    private fun addOverlayFragment() {
        overlayFragment?.let {
            parentFragmentManager.beginTransaction()
                .replace(R.id.overlay_fragment_container, it)
                .commitAllowingStateLoss()
        }
    }

    fun setCameraPreview(enable: Boolean) {
        if (!::previewFragment.isInitialized) {
            if (!isInit) {
                synchronized(this) {
                    if (!isInit) {
                        isInit = true
                        initView(enable)
                    }
                }

            }
            return
        }

        if (enable) {
            if (previewFragment.isAdded) {
                return
            }
            parentFragmentManager.beginTransaction()
                .replace(R.id.preview_fragment_container, previewFragment)
                .commitAllowingStateLoss()
        } else {
            if (!previewFragment.isAdded) {
                return
            }
            parentFragmentManager.beginTransaction()
                .remove(previewFragment)
                .commitAllowingStateLoss()
        }
    }

    private fun initView(enable: Boolean) {
        previewFragment = CameraPreviewFragment()
        setCameraPreview(enable)
    }
}
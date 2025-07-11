package com.bytedance.ai.multimodal.teacher.view.popup.base

import android.view.View
import androidx.fragment.app.Fragment
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetBehavior.BottomSheetCallback

abstract class AbsBottomSheetFragment : Fragment() {

    private var bindBehavior: BottomSheetBehavior<*>? = null

    private var callback: BottomSheetCallback? = null

    fun bindBehavior(behavior: BottomSheetBehavior<*>) {
        this.bindBehavior = behavior
        behavior.setBottomSheetCallback(object : BottomSheetCallback() {
            override fun onStateChanged(bottomSheetView: View, newState: Int) {
                callback?.onStateChanged(bottomSheetView, newState)
                this@AbsBottomSheetFragment.onBottomSheetStateChanged(bottomSheetView,newState)
            }

            override fun onSlide(bottomSheetView: View, offset: Float) {
                callback?.onSlide(bottomSheetView, offset)
                this@AbsBottomSheetFragment.onSlide(bottomSheetView, offset)
            }
        })
    }

    fun setBottomSheetCallback(callback: BottomSheetCallback?) {
        this.callback = callback
    }

    abstract fun onSlide(bottomSheetView: View, offset: Float)

    abstract fun onBottomSheetStateChanged(bottomSheetView: View, newState: Int)

}
package com.bytedance.ai.multimodal.teacher.view.popup.base

import android.view.View
import com.google.android.material.bottomsheet.BottomSheetBehavior

abstract class PopupCallback : BottomSheetBehavior.BottomSheetCallback() {

    override fun onStateChanged(p0: View, p1: Int) {}

    override fun onSlide(bottomSheet: View, slideOffset: Float) {}

    open fun onInit(peekHeight: Int){}

}
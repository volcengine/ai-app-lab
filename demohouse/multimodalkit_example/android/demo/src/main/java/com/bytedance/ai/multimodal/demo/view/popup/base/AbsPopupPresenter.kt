package com.bytedance.ai.multimodal.demo.view.popup.base

import android.widget.FrameLayout

abstract class AbsPopupPresenter {

    /**
     * 覆盖在相机上面的fragment
     */
    abstract fun getOverlayFragment(): AbsOverlayFragment

    /**
     * 底部弹出的fragment
     */
    abstract fun getBottomSheetFragment(): AbsBottomSheetFragment?

    /**
     * 初始化操作容器
     */
    open fun initOperationContainer(container: FrameLayout) {}

}
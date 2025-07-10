package com.bytedance.ai.multimodal.shopping.page.shopping

import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsBottomSheetFragment
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsOverlayFragment
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsPopupPresenter

class ShoppingPresenter : AbsPopupPresenter() {

    override fun getOverlayFragment(): AbsOverlayFragment {
        return ShoppingFragment()
    }

    override fun getBottomSheetFragment(): AbsBottomSheetFragment? {
        return null
    }
}
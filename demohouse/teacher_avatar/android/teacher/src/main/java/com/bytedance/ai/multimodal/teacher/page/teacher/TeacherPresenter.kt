package com.bytedance.ai.multimodal.teacher.page.teacher

import com.bytedance.ai.multimodal.teacher.view.popup.base.AbsBottomSheetFragment
import com.bytedance.ai.multimodal.teacher.view.popup.base.AbsOverlayFragment
import com.bytedance.ai.multimodal.teacher.view.popup.base.AbsPopupPresenter

class TeacherPresenter : AbsPopupPresenter() {

    override fun getOverlayFragment(): AbsOverlayFragment {
        return TeacherFragment()
    }

    override fun getBottomSheetFragment(): AbsBottomSheetFragment? {
        return null
    }
}
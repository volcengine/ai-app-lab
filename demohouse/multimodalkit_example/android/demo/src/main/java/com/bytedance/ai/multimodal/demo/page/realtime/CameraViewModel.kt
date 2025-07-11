package com.bytedance.ai.multimodal.demo.page.realtime

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.bytedance.ai.multimodal.demo.view.popup.base.AbsPopupPresenter
import com.bytedance.ai.multimodal.demo.view.popup.base.PopupCallback

class CameraViewModel : ViewModel() {

    val presenterLiveData = MutableLiveData<AbsPopupPresenter>()
    val popupCallbackLiveData = MutableLiveData<PopupCallback?>()

    fun setPresenter(presenter: AbsPopupPresenter) {
        presenterLiveData.value = presenter
    }
}
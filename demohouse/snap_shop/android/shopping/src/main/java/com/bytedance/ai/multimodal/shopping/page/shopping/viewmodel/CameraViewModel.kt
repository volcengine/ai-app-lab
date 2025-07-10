package com.bytedance.ai.multimodal.shopping.page.shopping.viewmodel

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.bytedance.ai.multimodal.shopping.view.popup.base.AbsPopupPresenter
import com.bytedance.ai.multimodal.shopping.view.popup.base.PopupCallback

class CameraViewModel : ViewModel() {

    val presenterLiveData = MutableLiveData<AbsPopupPresenter>()
    val popupCallbackLiveData = MutableLiveData<PopupCallback?>()

    fun setPresenter(presenter: AbsPopupPresenter) {
        presenterLiveData.value = presenter
    }
}
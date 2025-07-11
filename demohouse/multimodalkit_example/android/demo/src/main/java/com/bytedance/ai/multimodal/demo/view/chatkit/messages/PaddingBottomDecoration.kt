package com.bytedance.ai.multimodal.demo.view.chatkit.messages

import android.graphics.Rect
import androidx.recyclerview.widget.RecyclerView

class PaddingBottomDecoration : RecyclerView.ItemDecoration() {

    override fun getItemOffsets(outRect: Rect, itemPosition: Int, parent: RecyclerView) {
        val count = parent.adapter?.itemCount ?: 0
        if (count == 0) {
            outRect.set(0, 0, 0, 0)
            return
        }

        if (itemPosition == count - 1) {
            outRect.set(0, 0, 0, 40)
        } else {
            outRect.set(0, 0, 0, 0)
        }
    }

}
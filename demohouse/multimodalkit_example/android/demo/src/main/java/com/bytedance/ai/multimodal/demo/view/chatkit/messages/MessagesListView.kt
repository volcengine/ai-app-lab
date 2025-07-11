package com.bytedance.ai.multimodal.demo.view.chatkit.messages

import android.content.Context
import android.util.AttributeSet
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bytedance.ai.multimodal.demo.R

class MessagesListView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0
) : RecyclerView(context, attrs, defStyleAttr) {
    var maxHeight: Int = 0

    init {
        layoutManager = LinearLayoutManager(context).apply {
            stackFromEnd = true
        }
        itemAnimator?.changeDuration = 0
        val typedArray = context.obtainStyledAttributes(attrs, R.styleable.MessagesListView)
        maxHeight = typedArray.getDimensionPixelSize(R.styleable.MessagesListView_maxHeight, 0)
        typedArray.recycle()
    }

    fun scrollToBottom() {
        adapter?.apply {
            scrollToPosition(this.itemCount - 1)
        }
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val heightSpecAdjusted = if (maxHeight > 0) {
            MeasureSpec.makeMeasureSpec(maxHeight, MeasureSpec.AT_MOST)
        } else {
            heightSpec
        }
        super.onMeasure(widthSpec, heightSpecAdjusted)
    }
}
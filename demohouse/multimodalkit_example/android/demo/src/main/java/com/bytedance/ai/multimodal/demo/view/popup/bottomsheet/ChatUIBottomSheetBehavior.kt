package com.bytedance.ai.multimodal.demo.view.popup.bottomsheet

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.recyclerview.widget.RecyclerView
import com.bytedance.ai.multimodal.demo.AppCore
import com.bytedance.ai.multimodal.demo.R
import com.google.android.material.bottomsheet.BottomSheetBehavior
import kotlin.math.abs

class ChatUIBottomSheetBehavior<V : View> : BottomSheetBehavior<V> {
    constructor() : super()
    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs)
    private var startY = 0f
    private var startX = 0f
    private val touchSlop = ViewConfiguration.get(AppCore.inst).scaledTouchSlop

    override fun onInterceptTouchEvent(parent: CoordinatorLayout, child: V, event: MotionEvent): Boolean {
        val rv: View? = child.findViewById<RecyclerView>(R.id.message_list)

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                // 记录初始触摸位置
                startY = event.y
                startX = event.x
            }
            MotionEvent.ACTION_MOVE -> {
                val deltaY = event.y - startY
                val deltaX = event.x - startX

                if (abs(deltaY) > abs(deltaX) && abs(deltaY) > touchSlop) {
                    // 判断滑动方向：向上滑动还是向下滑动
                    val isScrollingUp = deltaY > 0
                    val canScroll = if (isScrollingUp) {
                        rv?.canScrollVertically(-1) // 判断能否向上滚动
                    } else {
                        rv?.canScrollVertically(1) // 判断能否向下滚动
                    }

                    if (canScroll == true) {
                        parent.requestDisallowInterceptTouchEvent(true)
                        return false
                    }
                }
            }
        }
        return super.onInterceptTouchEvent(parent, child, event)
    }
}
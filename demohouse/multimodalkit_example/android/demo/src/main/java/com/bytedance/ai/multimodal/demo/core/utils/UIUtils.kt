package com.bytedance.ai.multimodal.demo.core.utils

import android.app.Activity
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Point
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.view.View
import android.view.ViewOutlineProvider
import androidx.annotation.ColorInt
import androidx.core.graphics.ColorUtils

object UIUtils {

    /**
     * 获取屏幕高度（完整屏幕高度，包括状态栏）
     */
    fun getRealScreenHeight(activity: Activity): Int {
        val point = Point()
        activity.windowManager.defaultDisplay.getRealSize(point)
        return point.y
    }

    /**
     * 设置视图裁剪的圆角半径
     *
     * @param radius
     */
    @JvmStatic
    fun setClipViewCornerRadius(view: View?, radius: Int) {
        view?.let {
            it.outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, radius.toFloat())
                }
            }
            it.clipToOutline = true
        }
    }

    /**
     * 获取一个带按压效果的Drawable
     * 按压色为正常色值上加10%的黑
     */
    fun getDrawableWithPress(@ColorInt normalColor: Int?, radius: Float?): StateListDrawable {
        val normalColo = normalColor ?: Color.TRANSPARENT
        val pressColor = normalColo.runCatching { ColorUtils.blendARGB(this, Color.BLACK, 0.1f) }.getOrNull()
        return getDrawableWithPress(normalColo, pressColor, radius)
    }

    /**
     * 获取一个带按压效果的Drawable
     */
    fun getDrawableWithPress(
        @ColorInt normalColor: Int?,
        @ColorInt pressColor: Int?,
        radius: Float?,
    ): StateListDrawable {
        val normalColo = normalColor ?: Color.TRANSPARENT
        val normalDrawable = GradientDrawable().apply {
            setColor(normalColo)
            radius?.let { cornerRadius = it }
        }
        val pressDrawable = GradientDrawable().apply {
            pressColor?.let { setColor(it) }
            radius?.let { cornerRadius = it }
        }
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_pressed), pressDrawable)
            addState(intArrayOf(), normalDrawable)
        }
    }

    /**
     * view是否在全屏范围内完全可见
     */
    fun isGlobalFullVisible(view: View): Boolean {
        val rect = Rect()
        return view.getGlobalVisibleRect(rect) && view.width == rect.width() && view.height == rect.height()
    }
}
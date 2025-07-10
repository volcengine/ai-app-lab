package com.bytedance.ai.multimodal.shopping.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.util.AttributeSet
import android.util.Log
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.appcompat.content.res.AppCompatResources
import androidx.constraintlayout.widget.ConstraintLayout
import com.bytedance.ai.multimodal.shopping.R
import kotlin.math.pow
import kotlin.math.sqrt
import androidx.core.graphics.toColorInt
import com.bytedance.ai.multimodal.common.utils.UnitUtils.dp2px

class CameraGuidanceOverlay @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private var onCloseListener: (() -> Unit)? = null
    private var onNextListener: (() -> Unit)? = null
    private var tipView: TipDrawingView? = null
    private var tipResId = R.drawable.ic_guide_tip_shopping

    init {
        // 加载XML布局
        val inflatedView = LayoutInflater.from(context).inflate(R.layout.layout_guide_sample, this, true)

        // 找到按钮并设置点击事件
        val closeBtn = inflatedView.findViewById<View>(R.id.guide_sample_close)
        closeBtn.setOnClickListener {
            onCloseListener?.invoke()
        }

        tipView = TipDrawingView(context)
        addView(tipView, 0)
        tipView?.isClickable = true
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        // 判断触摸点是否在屏幕底部52dp内
        val bottomLimit = height - 52.dp2px()
        Log.i("CameraOverlay", "onInterceptTouchEvent bottomLimit=$bottomLimit y=${ev.y}")
        if (ev.y >= bottomLimit) {
            Log.i("CameraOverlay", "onInterceptTouchEvent return false")
            return false // 不拦截事件，让事件传递到下层view
        }
        return super.onInterceptTouchEvent(ev)
    }

    override fun onTouchEvent(event: MotionEvent?): Boolean {
        event?.let {
            // 判断触摸点是否在屏幕底部52dp内
            val bottomLimit = height - 52.dp2px()
            if (it.y >= bottomLimit) {
                return false // 不拦截事件，让事件传递到下层view
            }
        }
        return super.onTouchEvent(event)
    }

    fun setCameraButtonPosition(centerX: Float, centerY: Float, radius: Float) {
        tipView?.setCameraButtonPosition(centerX, centerY, radius)
    }

    fun setOnCloseListener(listener: (() -> Unit)?) {
        onCloseListener = listener
    }

    fun setOnNextListener(listener: (() -> Unit)?) {
        onNextListener = listener
    }

    fun setSampleImage(resId: Int, verticalBias: Float) {
        val img = findViewById<ImageView>(R.id.guide_sample_img)
        img.setImageResource(resId)
        (img.layoutParams as? ConstraintLayout.LayoutParams)?.let {
            it.verticalBias = verticalBias
            img.layoutParams = it
        }
    }

    fun setTipResId(resId: Int) {
        tipResId = resId
        tipView?.invalidate()
    }

    fun setCloseBtnVisible(visible: Boolean) {
        findViewById<ImageView>(R.id.guide_sample_close).visibility = if (visible) VISIBLE else INVISIBLE
    }

    override fun setOnClickListener(l: OnClickListener?) {
        tipView?.setOnClickListener(l)
    }

    private inner class TipDrawingView(context: Context) : View(context) {

        private var cameraButtonCenterX = 0f
        private var cameraButtonCenterY = 0f
        private var cameraButtonRadius = 0f


        private val backgroundPaint = Paint().apply {
            color = "#99000000".toColorInt() // 半透明黑色
            isAntiAlias = true
        }

        private val clearPaint = Paint().apply {
            xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
            isAntiAlias = true
        }

        init {
            setLayerType(LAYER_TYPE_HARDWARE, null)
        }

        fun setCameraButtonPosition(centerX: Float, centerY: Float, radius: Float) {
            cameraButtonCenterX = centerX
            cameraButtonCenterY = centerY
            cameraButtonRadius = radius
            invalidate()
        }

        override fun onTouchEvent(event: MotionEvent?): Boolean {
            event?.let {
                // 判断触摸点是否在屏幕底部52dp内
                val bottomLimit = height - 52.dp2px()
                if (it.y >= bottomLimit) {
                    return false // 不拦截事件，让事件传递到下层view
                }
            }
            when (event?.action) {
                MotionEvent.ACTION_DOWN -> {
                    // 计算触摸点到圆心的距离
                    val distance = sqrt(
                        (event.x - cameraButtonCenterX).pow(2) + (event.y - cameraButtonCenterY).pow(2)
                    )

                    // 如果触摸点在圆内，则响应点击事件
                    if (distance <= cameraButtonRadius) {
                        return true // 表示我们对这个事件感兴趣，请继续发送后续事件
                    }
                }
                MotionEvent.ACTION_UP -> {
                    // 计算触摸点到圆心的距离
                    val distance = sqrt(
                        (event.x - cameraButtonCenterX).pow(2) + (event.y - cameraButtonCenterY).pow(2)
                    )

                    // 如果手指释放时仍在圆内，则触发点击事件
                    if (distance <= cameraButtonRadius) {
                        onNextListener?.invoke()
                        performClick() // 触发可访问性事件
                        return true
                    }
                }
            }
            return super.onTouchEvent(event)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            // 绘制半透明背景
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat() - 52.dp2px(), backgroundPaint)

            // 清除拍照按钮区域，使其高亮
            if (cameraButtonCenterX > 0) {
                canvas.drawCircle(cameraButtonCenterX, cameraButtonCenterY, cameraButtonRadius, clearPaint)

                val tipDrawable = AppCompatResources.getDrawable(context, tipResId)
                tipDrawable?.let {

                    val drawableWidth = it.intrinsicWidth
                    val drawableHeight = it.intrinsicHeight

                    val tipLeft = cameraButtonCenterX - drawableWidth / 2f
                    // 补偿按钮半径由于阴影导致多余的长度(+6dp时tip与按钮刚好贴紧)
                    val tipTop = cameraButtonCenterY - cameraButtonRadius - drawableHeight + 4.dp2px()
                    it.setBounds(
                        tipLeft.toInt(), tipTop.toInt(), (tipLeft + drawableWidth).toInt(),
                        (tipTop + drawableHeight).toInt()
                    )
                    it.draw(canvas)
                }
            }
        }
    }

}
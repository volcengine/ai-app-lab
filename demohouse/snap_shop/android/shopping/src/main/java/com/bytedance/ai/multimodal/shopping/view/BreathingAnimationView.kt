package com.bytedance.ai.multimodal.shopping.view

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.bytedance.ai.multimodal.common.utils.UnitUtils.dp2px

class BreathingAnimationView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    companion object {
        const val STATE_IDLE = 0
        const val STATE_ERROR = 1
        const val STATE_BREATHING = 2
        const val STATE_MIC_RECORDING = 3

        const val COLOR_IDLE = Color.WHITE
        const val COLOR_ERROR = Color.RED
        const val COLOR_BREATHING = Color.WHITE
        const val COLOR_MIC_RECORDING = Color.WHITE
    }

    private var animator: ValueAnimator? = null
    private var state: Int = STATE_IDLE
    private var volumeLevel: Float = 0f // 记录当前音量大小

    private val rectAPaint = Paint().apply {
        color = ContextCompat.getColor(context, android.R.color.white)
        alpha = (0.6 * 255).toInt() // 设置透明度为 0.6
        isAntiAlias = true
    }

    private val rectBPaint = Paint().apply {
        color = ContextCompat.getColor(context, android.R.color.white)
    }

    private val rectA = RectF()
    private val rectB = RectF()

    private var blurA = 80f // 初始 Blur 值
    private var alphaA = 0.6f
    private var scaleA = 1f
    private var scaleAHeight = 1f

    private var blurB = 24f // 固定 Blur 值
    private var scaleB = 1f
    private var scaleBHeight = 1f
    private var alphaB = 1f

    fun setState(state: Int) {
        this.state = state
        when (state) {
            STATE_IDLE, STATE_ERROR -> {
                rectAPaint.color = getColorForState(state)
                rectBPaint.color = getColorForState(state)
                stopBreathingAnimation()
            }
            STATE_BREATHING -> {
                rectAPaint.color = COLOR_BREATHING
                rectBPaint.color = COLOR_BREATHING
                startBreathingAnimation()
            }
            STATE_MIC_RECORDING -> {
                rectAPaint.color = COLOR_MIC_RECORDING
                rectBPaint.color = COLOR_MIC_RECORDING
                stopBreathingAnimation()
            }
        }
    }

    private fun getColorForState(state: Int): Int {
        return when (state) {
            STATE_IDLE -> COLOR_IDLE
            STATE_ERROR -> COLOR_ERROR
            STATE_MIC_RECORDING -> COLOR_MIC_RECORDING
            else -> COLOR_IDLE
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // 设置 Rect A 的绘制区域
        val rectAWidth = 170.dp2px() * scaleA
        val rectAHeight = 38.dp2px() * scaleAHeight
        rectA.set(
            (width / 2f) - rectAWidth / 2f,
            (height / 2f) - rectAHeight / 2f,
            (width / 2f) + rectAWidth / 2f,
            (height / 2f) + rectAHeight / 2f
        )

        // 设置 Rect B 的绘制区域
        val rectBWidth = 120.dp2px().toFloat() * scaleB
        val rectBHeight = 28.dp2px().toFloat() * scaleBHeight
        rectB.set(
            (width / 2f) - rectBWidth / 2f,
            (height / 2f) - rectBHeight / 2f,
            (width / 2f) + rectBWidth / 2f,
            (height / 2f) + rectBHeight / 2f
        )

        // 设置模糊效果
        rectAPaint.maskFilter = BlurMaskFilter(blurA, BlurMaskFilter.Blur.NORMAL)
        rectBPaint.maskFilter = BlurMaskFilter(blurB, BlurMaskFilter.Blur.NORMAL)

        // 绘制矩形 A
        rectAPaint.alpha = (alphaA * 255).toInt()
        canvas.drawRoundRect(rectA, rectAHeight / 2, rectAHeight / 2, rectAPaint)
//        canvas.drawOval(rectA, rectAPaint)

        // 绘制矩形 B
        rectBPaint.alpha = (alphaB * 255).toInt()
        canvas.drawRoundRect(rectB, rectBHeight / 2, rectBHeight / 2, rectBPaint)
//        canvas.drawOval(rectB, rectBPaint)
    }

    private fun stopBreathingAnimation() {
        animator?.cancel()
        animator = null
    }

    private fun startBreathingAnimation() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0.1f, 1f).apply {
            duration = 800
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                val value = it.animatedValue as Float
                blurA = 50f + value * 20f
                alphaA = 0.2f + value * 0.8f
                scaleA = 1f + value * 0.16f
                scaleAHeight = 1f + value * 0.16f
                alphaB = 0.2f + value * 0.8f
                scaleB = 1f + value * 0.16f
                scaleBHeight = 1f + value * 0.16f
                invalidate()
            }
        }
        animator?.start()
    }

    fun receiveMicrophoneData(data: ByteArray) {
        if (state != STATE_MIC_RECORDING) return

        val volume = calculateVolume(data)
        volumeLevel = 0.5f * volumeLevel + 0.5f * volume

        blurA = 40f + volumeLevel * 60f
        alphaA = 0.1f + volumeLevel * 0.9f
        scaleA = 1f + volumeLevel * 0.4f
        scaleAHeight = 1f + volumeLevel * 0.4f
        alphaB = 0.1f + volumeLevel * 0.9f
        scaleB = 1f + volumeLevel * 0.4f
        scaleBHeight = 1f + volumeLevel * 0.4f

        invalidate()
    }

    private fun calculateVolume(data: ByteArray): Float {
        if (data.isEmpty()) return 0f

        var maxAmplitude = 0

        for (i in data.indices step 2) {
            val sample = ((data[i + 1].toInt() shl 8) or (data[i].toInt() and 0xFF)) // 解析有符号 16-bit PCM
            maxAmplitude = maxOf(maxAmplitude, kotlin.math.abs(sample)) // 记录最大振幅
        }

        return (maxAmplitude / Short.MAX_VALUE.toFloat()).coerceIn(0f, 1f) // 归一化到 0~1
    }
}

package com.bytedance.ai.multimodal.shopping.vision.camera

import android.graphics.Path
import android.graphics.Point
import android.graphics.PointF
import android.graphics.Rect
import android.graphics.RectF
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs

typealias OnSelectListener = (Int, Int, Point?, Rect?) -> Unit

class SelectObjectHelper(val graphicOverlay: GraphicOverlay) {

    companion object {
        private const val TAG = "SelectObjectHelper"
    }

    private var isEnable: Boolean = false

    val path = Path() // 记录用户绘制的路径
    private var isDrawing = false // 标记是否正在绘制路径
    private var onSelectListener: OnSelectListener? = null
    private var startX = 0f
    private var startY = 0f
    private val touchSlop = ViewConfiguration.get(graphicOverlay.context).scaledTouchSlop // 用于区分点击和拖动的阈值
    private var lastClickTime: Long = 0
    private val doubleClickTimeout = ViewConfiguration.getDoubleTapTimeout().toLong()

    fun onTouchEvent(event: MotionEvent): Boolean {
        if (!isEnable) {
            return false
        }
        val x = event.x
        val y = event.y

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                startX = x
                startY = y

                // 记录按下时的坐标
                path.moveTo(x, y)
                isDrawing = false // 暂时认为不是在绘制路径

                val currentTime = SystemClock.uptimeMillis()
                if (currentTime - lastClickTime < doubleClickTimeout) {
                    // 双击操作
                    val clickedPoint = getImagePoint(PointF(x, y))
                    Log.d(TAG, "Double Clicked Point: ${clickedPoint.x}, ${clickedPoint.y}")
                    onSelectListener?.invoke(graphicOverlay.previewWidth, graphicOverlay.previewHeight,
                        Point(clickedPoint.x.toInt(), clickedPoint.y.toInt()), null)
                }
                lastClickTime = currentTime
            }

            MotionEvent.ACTION_MOVE -> {
//                graphicOverlay.parent.requestDisallowInterceptTouchEvent(true)

                if (abs(x - startX) > touchSlop || abs(y - startY) > touchSlop) {
                    isDrawing = true
                    path.lineTo(x, y)
                    graphicOverlay.invalidate()
                }
            }

            MotionEvent.ACTION_UP -> {
                if (isDrawing) {
                    // 结束画圈操作
                    isDrawing = false

                    // 计算路径的边界矩阵
                    val bounds = RectF()
                    path.computeBounds(bounds, true)

                    // 获取原图像素上的边界矩阵坐标
                    val originalTopLeft = getImagePoint(PointF(bounds.left, bounds.top))
                    val originalBottomRight = getImagePoint(PointF(bounds.right, bounds.bottom))

                    Log.d(TAG, "Selected Area Top Left: ${originalTopLeft.x}, ${originalTopLeft.y}")
                    Log.d(
                        TAG,
                        "Selected Area Bottom Right: ${originalBottomRight.x}, ${originalBottomRight.y}"
                    )

                    onSelectListener?.invoke(
                        graphicOverlay.previewWidth, graphicOverlay.previewHeight,
                        null,
                        Rect(
                            originalTopLeft.x.toInt(),
                            originalTopLeft.y.toInt(),
                            originalBottomRight.x.toInt(),
                            originalBottomRight.y.toInt()
                        )
                    )

                    // 重置路径以便下一次操作
                    path.reset()
                    graphicOverlay.invalidate()
                }
            }
        }
        return true
    }

    private fun getImagePoint(touchPoint: PointF): PointF {
        val touchPoints = floatArrayOf(touchPoint.x, touchPoint.y)

        // 将触摸点转换为预览图像素坐标
        return PointF(graphicOverlay.toRawX(touchPoints[0]), graphicOverlay.toRawY(touchPoints[1]))
    }

    fun enable(enable: Boolean, onSelectListener: OnSelectListener?) {
        isEnable = enable
        this.onSelectListener = onSelectListener
    }
}
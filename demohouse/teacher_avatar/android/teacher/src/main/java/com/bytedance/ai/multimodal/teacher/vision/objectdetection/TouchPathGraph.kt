package com.bytedance.ai.multimodal.teacher.vision.objectdetection

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.bytedance.ai.multimodal.teacher.vision.camera.GraphicOverlay

class TouchPathGraph internal constructor(
    overlay: GraphicOverlay,
    val path: Path
) : GraphicOverlay.Graphic(overlay)  {

    private val paint = Paint().apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 5f
    }

    override fun draw(canvas: Canvas) {
        // 绘制用户手动画的路径
        canvas.drawPath(path, paint)
    }
}
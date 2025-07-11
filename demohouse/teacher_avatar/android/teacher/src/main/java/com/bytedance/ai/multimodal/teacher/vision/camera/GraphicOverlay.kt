/*
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.bytedance.ai.multimodal.teacher.vision.camera

import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.RectF
import android.util.AttributeSet
import android.util.Size
import android.view.MotionEvent
import android.view.View
import com.bytedance.ai.multimodal.algorithm.api.opencv.MatOfPointWrapper
import com.bytedance.ai.multimodal.teacher.vision.objectdetection.TouchPathGraph
import java.util.ArrayList
import kotlin.math.max
import kotlin.math.min

/**
 * A view which renders a series of custom graphics to be overlaid on top of an associated preview
 * (i.e., the camera preview). The creator can add graphics objects, update the objects, and remove
 * them, triggering the appropriate drawing and invalidation within the view.
 *
 *
 * Supports scaling and mirroring of the graphics relative the camera's preview properties. The
 * idea is that detection items are expressed in terms of a preview size, but need to be scaled up
 * to the full view size, and also mirrored in the case of the front-facing camera.
 *
 *
 * Associated [Graphic] items should use [.translateX] and [ ][.translateY] to convert to view coordinate from the preview's coordinate.
 */

class GraphicOverlay(context: Context, attrs: AttributeSet) : View(context, attrs) {
    private val lock = Any()

    var previewWidth: Int = 0
    var previewHeight: Int = 0
    private var widthScaleFactor = 1.0f
    private var heightScaleFactor = 1.0f
    private val oneFrameGraphics = ArrayList<Graphic>()
    private val staticGraphics = ArrayList<Graphic>()

    private val selectObjectHelper = SelectObjectHelper(this)

    //是否是fit center，若是，scale应该是选取短边适配，否则默认视为fill center，选取长边适配
    private var isFitCenter: Boolean = false

    /**
     * Base class for a custom graphics object to be rendered within the graphic overlay. Subclass
     * this and implement the [Graphic.draw] method to define the graphics element. Add
     * instances to the overlay using [GraphicOverlay.add].
     */
    abstract class Graphic protected constructor(protected val overlay: GraphicOverlay) {
        protected val context: Context = overlay.context

        /** Draws the graphic on the supplied canvas.  */
        abstract fun draw(canvas: Canvas)
    }

    /** Removes all graphics from the overlay.  */
    fun clear() {
        synchronized(lock) {
            oneFrameGraphics.clear()
        }
        postInvalidate()
    }

    fun removeType(predicate: Class<out Graphic>) {
        synchronized(lock) {
            val iterator = oneFrameGraphics.iterator()
            while (iterator.hasNext()) {
                val graphic = iterator.next()
                if (predicate.isInstance(graphic)) {
                    iterator.remove()
                }
            }
            val iterator2 = staticGraphics.iterator()
            while (iterator2.hasNext()) {
                val graphic = iterator2.next()
                if (predicate.isInstance(graphic)) {
                    iterator2.remove()
                }
            }
        }
        postInvalidate()
    }

    /** Adds a graphic to the overlay.  */
    fun add(graphic: Graphic, isOneFrameGraph:Boolean = true) {
        synchronized(lock) {
            if (isOneFrameGraph) {
                oneFrameGraphics.add(graphic)
            } else {
                staticGraphics.add(graphic)
            }
        }
    }

    /**
     * Sets the camera attributes for size and facing direction, which informs how to transform image
     * coordinates later.
     */
    fun setCameraInfo(previewSize: Size) {
        if (isPortraitMode(context)) {
            // Swap width and height when in portrait, since camera's natural orientation is landscape.
            previewWidth = previewSize.height
            previewHeight = previewSize.width
        } else {
            previewWidth = previewSize.width
            previewHeight = previewSize.height
        }
    }

    fun isPortraitMode(context: Context): Boolean =
        context.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT

    // view -> raw
    fun toRawX(x: Float): Float = (x - dx()) / targetScale()
    fun toRawY(y: Float): Float = (y - dy()) / targetScale()

    // raw -> view
    fun translateX(x: Float): Float = x * targetScale() + dx()
    fun translateY(y: Float): Float = y * targetScale() + dy()

    fun dx() = (width.toFloat() - previewWidth * targetScale()) / 2
    fun dy() = (height.toFloat() - previewHeight * targetScale()) / 2

    fun targetScale(): Float {
        return if (isFitCenter) {
            min(widthScaleFactor, heightScaleFactor)
        } else {
            max(widthScaleFactor, heightScaleFactor)
        }
    }

    fun enableSelectObject(enable: Boolean, onSelectListener: OnSelectListener) {
        selectObjectHelper.enable(enable, onSelectListener)
        if (enable) {
            add(TouchPathGraph(this, selectObjectHelper.path), false)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (selectObjectHelper.onTouchEvent(event)) {
            return true
        }
        return super.onTouchEvent(event)
    }

    /** Draws the overlay with its associated graphic objects.  */
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (previewWidth > 0 && previewHeight > 0) {
            widthScaleFactor = width.toFloat() / previewWidth
            heightScaleFactor = height.toFloat() / previewHeight
        }

        synchronized(lock) {
            oneFrameGraphics.forEach { it.draw(canvas) }
            staticGraphics.forEach { it.draw(canvas) }
        }
    }

    fun setScaleType(isFitCenter: Boolean) {
        this.isFitCenter = isFitCenter
    }
}
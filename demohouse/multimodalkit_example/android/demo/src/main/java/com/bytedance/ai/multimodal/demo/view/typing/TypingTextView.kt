package com.bytedance.ai.multimodal.demo.view.typing

import android.content.Context
import android.util.AttributeSet
import androidx.appcompat.widget.AppCompatTextView
import com.bytedance.ai.multimodal.common.base.StreamingString
import com.bytedance.ai.multimodal.common.base.StreamingStringCallback
import com.bytedance.ai.multimodal.common.isNotNullOrEmpty
import com.bytedance.ai.multimodal.common.utils.ThreadUtils
import com.bytedance.ai.multimodal.common.utils.VibrateUtil

/**
 * 适配流式文本的TextView
 */
class TypingTextView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyleAttr: Int = 0
) : AppCompatTextView(context, attrs, defStyleAttr),
    StreamingStringCallback {

    private var actionDonFirstResponse: (() -> Unit)? = null

    private var isFirstResponse = true

    fun setStreamingText(streamingText: StreamingString) {
        streamingText.onStreamingString(this)
    }

    override fun callback(totalText: String, newText: String, isFinish: Boolean) {
        ThreadUtils.runOnMain{
            if (totalText.isNotNullOrEmpty()) {
                if (isFirstResponse){
                    actionDonFirstResponse?.invoke()
                    isFirstResponse = false
                }
                text = if (isFinish) {
                    totalText
                } else {
                    "${totalText}_"
                }
                if (!isFinish) {
                    VibrateUtil.vibrate(VibrateUtil.SHORT_DURATION)
                }
            }
        }
    }
}
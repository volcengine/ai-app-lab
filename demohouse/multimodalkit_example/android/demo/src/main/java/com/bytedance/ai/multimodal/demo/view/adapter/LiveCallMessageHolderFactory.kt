package com.bytedance.ai.multimodal.demo.view.adapter

import android.util.Log
import android.view.ViewGroup
import com.bytedance.ai.multimodal.demo.view.chatkit.base.BaseChatMessage
import com.bytedance.ai.multimodal.demo.view.chatkit.base.MessageContentType

object LiveCallMessageHolderFactory {

    private const val VIEW_TYPE_UNKNOWN = 0xffff
    private const val VIEW_TYPE_BOT_TEXT_MESSAGE = 1
    private const val VIEW_TYPE_USER_TEXT_MESSAGE = 2
    private const val VIEW_TYPE_USER_IMG_MESSAGE = 3
    private const val TAG = "LiveCallMessageHolderFa"

    fun getViewType(data: BaseChatMessage<*>): Int {
        return when (data.contentType) {
            MessageContentType.TXT ->
                if (data.isFromUser) {
                    VIEW_TYPE_USER_TEXT_MESSAGE
                } else {
                    VIEW_TYPE_BOT_TEXT_MESSAGE
                }

            MessageContentType.TXT_IMG ->
                VIEW_TYPE_USER_IMG_MESSAGE

            else -> {
                VIEW_TYPE_UNKNOWN
            }
        }
    }

    fun createViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        return when (viewType) {
            VIEW_TYPE_BOT_TEXT_MESSAGE -> LiveCallBotTextViewHolder(parent)
            VIEW_TYPE_USER_TEXT_MESSAGE -> LiveCallUserTextViewHolder(parent)
            VIEW_TYPE_USER_IMG_MESSAGE -> LiveCallUserTextViewHolder(parent)
            else -> {
                Log.e(TAG, "onCreateViewHolder: ERROR view type, is $viewType")
                LiveCallBotTextViewHolder(parent)
            }
        }
    }
}
package com.bytedance.ai.multimodal.demo.view.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.demo.view.chatkit.base.BaseChatMessage
import com.bytedance.ai.multimodal.demo.databinding.ViewBotTextMessageBinding

class LiveCallBotTextViewHolder(parent: ViewGroup) : MessageViewHolder(
    LayoutInflater.from(parent.context).inflate(
        R.layout.view_bot_text_message, parent, false
    )
) {

    val binding = ViewBotTextMessageBinding.bind(itemView)

    override fun onBind(data: BaseChatMessage<*>, position: Int) {
        binding.messageText.text = ""
        when (data) {
            is StreamingChatMessage -> {
                data.contentObject?.let {
                    binding.messageText.setStreamingText(it)
                }
            }
        }
    }
}
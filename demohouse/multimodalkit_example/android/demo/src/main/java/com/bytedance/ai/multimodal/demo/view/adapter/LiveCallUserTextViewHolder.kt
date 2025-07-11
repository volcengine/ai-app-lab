package com.bytedance.ai.multimodal.demo.view.adapter

import android.view.LayoutInflater
import android.view.ViewGroup

import com.bytedance.ai.multimodal.common.base.StreamingStringCallback
import com.bytedance.ai.multimodal.common.utils.ThreadUtils
import com.bytedance.ai.multimodal.common.utils.gone
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.demo.view.chatkit.base.BaseChatMessage
import com.bytedance.ai.multimodal.demo.databinding.ViewUserTextMessageBinding

class LiveCallUserTextViewHolder(parent: ViewGroup) : MessageViewHolder(
    LayoutInflater.from(parent.context).inflate(
    R.layout.view_user_text_message, parent, false
)) {

    val binding = ViewUserTextMessageBinding.bind(itemView)

    override fun onBind(data: BaseChatMessage<*>, position: Int) {
        binding.messageProgress.gone()
        binding.messageText.text = ""
        when (data) {
            is StreamingChatMessage -> {
                data.contentObject?.onStreamingString(object : StreamingStringCallback {
                    override fun callback(totalText: String, newText: String, isFinish: Boolean) {
                        ThreadUtils.runOnMain {
                            binding.messageText.text = totalText
                        }
                    }
                })
            }
        }
    }
}
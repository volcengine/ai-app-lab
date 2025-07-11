package com.bytedance.ai.multimodal.demo.view.adapter

import com.bytedance.ai.multimodal.common.base.StreamingString
import com.bytedance.ai.multimodal.demo.view.chatkit.base.BaseChatMessage
import com.bytedance.ai.multimodal.demo.view.chatkit.base.MessageContentType
import com.bytedance.ai.multimodal.demo.view.chatkit.base.MessageStatus

class StreamingChatMessage(
    contentObject: StreamingString,
    msgId: String? = "",
    replyId: String? = "",
    contentType: Int = MessageContentType.TXT,
    content: String? = "",
    status: Int = MessageStatus.SENDING,
    isFromUser: Boolean = true,
    isFinish: Boolean = true,
    ext: Map<String, String>? = null,
    createTime: Long = 0L,
    sectionId: String? = "DUMMY_SECTION"
) : BaseChatMessage<StreamingString>(
    msgId,
    contentType,
    content,
    contentObject,
    isFromUser,
    isFinish
)



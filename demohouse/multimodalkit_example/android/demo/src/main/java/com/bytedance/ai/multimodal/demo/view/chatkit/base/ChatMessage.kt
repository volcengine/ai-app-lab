package com.bytedance.ai.multimodal.demo.view.chatkit.base

import androidx.annotation.IntDef
import com.google.gson.annotations.SerializedName
import java.io.Serializable

open class BaseChatMessage<T>(
    val msgId: String? = "",
    @MessageContentType
    val contentType: Int = MessageContentType.TXT,
    var content: String? = "",
    var contentObject: T?,
    val isFromUser: Boolean = true,
    var isFinish: Boolean = true,
    val sectionId: String? = "DUMMY_SECTION"
) {

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as BaseChatMessage<*>

        return msgId == other.msgId
    }

    override fun hashCode(): Int {
        return msgId?.hashCode() ?: 0
    }
}

@IntDef(
    MessageContentType.UNSPECIFIED,
    MessageContentType.TXT,
    MessageContentType.TXT_IMG,
    MessageContentType.FOLLOW_UP,
    MessageContentType.WIDGET,
)
annotation class MessageContentType {
    companion object {
        const val UNSPECIFIED = 0
        const val TXT = 1
        const val TXT_IMG = 2
        const val FOLLOW_UP = 3
        const val FUNCTION_CALL = 4
        const val WIDGET = 100
    }
}

@IntDef(
    MessageStatus.UNKNOWN,
    MessageStatus.SENDING,
    MessageStatus.SEND_SUCCESS,
    MessageStatus.SEND_FAILED,
    MessageStatus.SEND_INTERRUPT,
    MessageStatus.RECEIVING,
    MessageStatus.RECEIVED,
    MessageStatus.RECEIVE_FAILED,
    MessageStatus.RECEIVE_INTERRUPT,
    MessageStatus.RECEIVE_LOADING,
)
annotation class MessageStatus {
    companion object {
        const val UNKNOWN = -1

        const val SENDING = 10
        const val SEND_SUCCESS = 11
        const val SEND_FAILED = 12
        const val SEND_INTERRUPT = 13
        const val RECEIVING = 20
        const val RECEIVED = 21
        const val RECEIVE_FAILED = 22
        const val RECEIVE_INTERRUPT = 23
        const val RECEIVE_LOADING = 24
    }
}

data class TextContent(
    @JvmField
    @SerializedName("text")
    var text: String? = null,
) : Serializable

data class FollowUpContent(
    @JvmField
    @SerializedName("follow_up")
    var followUp: List<String>? = null,
) : Serializable


data class MultiTypeContent(
    @JvmField
    @SerializedName("image_url")
    var imageUrl: List<String>? = null,

    @JvmField
    @SerializedName("local_image")
    var localImageUrl: List<String>? = null,

    @JvmField
    @SerializedName("text")
    var text: String? = null,
) : Serializable

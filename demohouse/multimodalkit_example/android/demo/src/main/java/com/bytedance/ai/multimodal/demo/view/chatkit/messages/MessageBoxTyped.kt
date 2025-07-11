package com.bytedance.ai.multimodal.demo.view.chatkit.messages

interface MessageBoxTyped {

    companion object {
        const val NOBOX = -1
        const val INBOX = 0
        const val OUTBOX = 1
        const val CENTER_BOX = 2
        const val FULL_BOX = 3
    }

    var boxType: Int
}

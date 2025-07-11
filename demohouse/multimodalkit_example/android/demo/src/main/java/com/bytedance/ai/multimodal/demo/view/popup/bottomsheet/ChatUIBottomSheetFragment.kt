package com.bytedance.ai.multimodal.demo.view.popup.bottomsheet

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import com.bytedance.ai.multimodal.common.base.StreamingString
import com.bytedance.ai.multimodal.common.utils.ScreenUtils.getScreenHeight
import com.bytedance.ai.multimodal.demo.core.utils.dp2px
import com.bytedance.ai.multimodal.demo.databinding.FragmentPopupSubBinding
import com.bytedance.ai.multimodal.demo.view.popup.base.AbsBottomSheetFragment
import com.bytedance.ai.multimodal.demo.view.adapter.ChatMessageAdapter
import com.bytedance.ai.multimodal.demo.view.adapter.ShowState
import com.bytedance.ai.multimodal.demo.view.adapter.StreamingChatMessage
import com.google.android.material.bottomsheet.BottomSheetBehavior

/**
 * 底部弹出的ChatUI类型的BottomSheetFragment
 */
class ChatUIBottomSheetFragment : AbsBottomSheetFragment() {

    private var maxHeight: Int = -1
    private lateinit var messagesListAdapter: ChatMessageAdapter
    private lateinit var binding: FragmentPopupSubBinding

    private var currentBottomSheetState: Int = BottomSheetBehavior.STATE_COLLAPSED
    private var isCollapsed: Boolean = true

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentPopupSubBinding.inflate(inflater)

        messagesListAdapter = ChatMessageAdapter()
        binding.messageList.also {
            it.adapter = messagesListAdapter
            it.layoutManager = LinearLayoutManager(context, LinearLayoutManager.VERTICAL, false).also {
                it.stackFromEnd = true
            }
        }
        maxHeight = (getScreenHeight(context) * 0.5).toInt()

        return binding.root
    }

    fun asrResponse(result: StreamingString) {
        messagesListAdapter.addMessageData(
            StreamingChatMessage(
                contentObject = result,
                isFromUser = true
            )
        )
        binding.messageList.scrollToBottom()
    }

    fun llmResponse(textToShow: StreamingString) {
        messagesListAdapter.addMessageData(
            StreamingChatMessage(
                contentObject = textToShow,
                isFromUser = false
            )
        )
        binding.messageList.scrollToBottom()
    }

    override fun onBottomSheetStateChanged(
        bottomSheetView: View,
        newState: Int
    ) {
        currentBottomSheetState = newState
        when (newState) {
            BottomSheetBehavior.STATE_COLLAPSED -> {
                messagesListAdapter.setShowState(ShowState.STATE_COLLAPSED)
                binding.messageList.maxHeight = 120.dp2px()
                (binding.container.layoutParams as FrameLayout.LayoutParams).bottomMargin = 120.dp2px()
                binding.messageList.requestLayout()
                if (!isCollapsed) {
                    binding.messageList.scrollToBottom()
                }
                isCollapsed = true
            }

            BottomSheetBehavior.STATE_DRAGGING -> {
                binding.root.apply {
                    layoutParams?.height = LayoutParams.MATCH_PARENT
                    requestLayout()
                }
            }

            BottomSheetBehavior.STATE_EXPANDED -> {
                messagesListAdapter.setShowState(ShowState.STATE_EXPANDED)
                binding.messageList.maxHeight = -1
                (binding.container.layoutParams as FrameLayout.LayoutParams).bottomMargin = 50.dp2px()
                binding.messageList.requestLayout()
                if (isCollapsed) {
                    binding.messageList.scrollToBottom()
                }
                isCollapsed = false
            }
        }
    }

    /**
     * offset [0~1]
     */
    override fun onSlide(
        bottomSheetView: View,
        offset: Float
    ) {
        if (offset < 0 || offset > 1) {
            return
        }
        val alpha = if (offset == 0f || offset == 1f) {
            1f
        } else if (offset == 0.5f) {
            0f
        } else {
            if (offset < 0.5f) {
                1 - (2 * offset)
            } else {
                1 - (2 * (1 - offset))
            }
        }
        if (offset > 0.5f) {
            messagesListAdapter.setShowState(ShowState.STATE_EXPANDED)
        } else {
            messagesListAdapter.setShowState(ShowState.STATE_COLLAPSED)
        }
        binding.messageList.alpha = alpha
    }
}
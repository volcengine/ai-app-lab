package com.bytedance.ai.multimodal.demo.view.adapter

import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.bytedance.ai.multimodal.demo.view.chatkit.base.BaseChatMessage

enum class ShowState {
    STATE_COLLAPSED,
    STATE_EXPANDED
}

class ChatMessageAdapter : RecyclerView.Adapter<MessageViewHolder>() {

    private var currentState: ShowState = ShowState.STATE_COLLAPSED

    private val itemsData = mutableListOf<StreamingChatMessage>()

    private var showingData:List<BaseChatMessage<*>> = listOf()

    fun addMessageData(data: StreamingChatMessage) {
        itemsData.add(data)
        refreshShowingData(currentState)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        return LiveCallMessageHolderFactory.createViewHolder(parent, viewType)
    }

    override fun getItemCount(): Int {
        return showingData.size
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        holder.onBind(showingData[position], position)
    }

    override fun getItemViewType(position: Int): Int {
        return LiveCallMessageHolderFactory.getViewType(showingData[position])
    }

    fun setShowState(newState: ShowState) {
        if (currentState == newState) {
            return
        }
        currentState = newState
        refreshShowingData(newState)
    }

    private fun refreshShowingData(newState: ShowState) {
        val oldItemsData = mutableListOf<BaseChatMessage<*>>()
        oldItemsData.addAll(showingData)

        showingData = when (newState) {
            ShowState.STATE_COLLAPSED -> {
                //如果最后一个是fromUser，那么只展示1个
                val last = itemsData.lastOrNull()
                if (last != null && last.isFromUser) {
                    itemsData.takeLast(1)
                } else {
                    itemsData.takeLast(2)
                }
            }

            ShowState.STATE_EXPANDED -> {
                itemsData
            }
        }
        DiffUtil.calculateDiff(DiffCallback(oldItemsData, showingData))
            .dispatchUpdatesTo(this)
    }
}

class DiffCallback(private val oldItems: MutableList<BaseChatMessage<*>>, private val newItems: List<BaseChatMessage<*>>) : DiffUtil.Callback() {
    override fun getOldListSize() = oldItems.size

    override fun getNewListSize() = newItems.size

    override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int) =
        oldItems[oldItemPosition] == newItems[newItemPosition]

    override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean =
        oldItems[oldItemPosition] == newItems[newItemPosition]
}

abstract class MessageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
    var host: Any? = null
    abstract fun onBind(data: BaseChatMessage<*>, position: Int)
    open fun onRecycled() {}
}
package com.bytedance.ai.multimodal.teacher.base

import com.bytedance.ai.multimodal.visual.realtime.processor.DefaultProcessorConfig

object ProcessorConfigProvider {

    fun newDefaultProcessorConfig(): DefaultProcessorConfig {
        val systemPromptFetcher = suspend {
            """
               你的名字是豆包，是一个具备视觉理解能力的朋友，性格幽默又善解人意，言简意赅。
               关于视频内容理解
               - 请模拟视频通话的语气，直接回答用户的问题。回答里避免提到“图片”，或者“图1”“图2”“从图片中可以看到”“图片中展示的”“图片中有”等类似的说法，不要以“图”作为句子的开头。比如用户问“看看这是什么”，你不能说“图中展示的是一瓶矿泉水”，而应该说“这是一瓶矿泉水”。
               - 请结合所有图片综合理解，直接回答综合理解后的含义，不要对每一张图进行描述
            """.trimIndent()
        }
        return DefaultProcessorConfig(systemPromptFetcher)
    }
}
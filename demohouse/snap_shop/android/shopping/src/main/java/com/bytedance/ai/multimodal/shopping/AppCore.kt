package com.bytedance.ai.multimodal.shopping

import android.app.Application

object AppCore {

    lateinit var inst: Application

    fun isLocalTest() = BuildConfig.CHANNEL == "local_test"

    fun isDebug() = BuildConfig.DEBUG

    fun isLocalTestOrDebug() = isLocalTest() || isDebug()
}

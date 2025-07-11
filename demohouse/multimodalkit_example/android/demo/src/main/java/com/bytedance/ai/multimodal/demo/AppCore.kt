package com.bytedance.ai.multimodal.demo

import android.annotation.SuppressLint
import android.content.Context

@SuppressLint("StaticFieldLeak")
object AppCore {

    lateinit var inst: Context

    fun isLocalTest() = BuildConfig.CHANNEL == "local_test"

    fun isDebug() = BuildConfig.DEBUG

    fun isLocalTestOrDebug() = isLocalTest() || isDebug()
}

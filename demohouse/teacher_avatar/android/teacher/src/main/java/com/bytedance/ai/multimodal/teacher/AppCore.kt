package com.bytedance.ai.multimodal.teacher

import android.annotation.SuppressLint
import android.app.Application
import android.content.Context

object AppCore {

    lateinit var inst: Application

    fun isLocalTest() = BuildConfig.CHANNEL == "local_test"

    fun isDebug() = BuildConfig.DEBUG

    fun isLocalTestOrDebug() = isLocalTest() || isDebug()
}

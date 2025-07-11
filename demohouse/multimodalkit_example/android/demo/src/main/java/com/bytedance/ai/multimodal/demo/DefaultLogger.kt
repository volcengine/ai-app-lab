package com.bytedance.ai.multimodal.demo

import android.util.Log
import com.bytedance.ai.multimodal.common.log.ILogger

object DefaultLogger : ILogger {
    override fun v(tag: String, msg: String?) {
        msg?.let {
            Log.v(tag, it)
        }
    }

    override fun d(tag: String, msg: String?) {
        msg?.let {
            Log.d(tag, msg)
        }
    }

    override fun i(tag: String, msg: String?) {
        msg?.let {
            Log.i(tag, it)
        }
    }

    override fun w(tag: String, msg: String?) {
        msg?.let {
            Log.w(tag, it)
        }
    }

    override fun w(tag: String, msg: String?, tr: Throwable?) {
        msg?.let {
            Log.w(tag, it, tr)
        }
    }

    override fun w(tag: String, tr: Throwable?) {
        Log.w(tag, tr)
    }

    override fun e(tag: String, msg: String?) {
        msg?.let {
            Log.e(tag, it)
        }
    }

    override fun e(tag: String, msg: String?, tr: Throwable?) {
        msg?.let {
            Log.e(tag, msg, tr)
        }
    }

    override fun getDirPath(): String {
        return AppCore.inst.filesDir.path
    }

    override fun uploadAllLog(scene: String, unit: ((Boolean) -> Unit)?) {
        //上报日志
    }
}

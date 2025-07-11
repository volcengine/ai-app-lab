package com.bytedance.ai.multimodal.teacher.core.utils

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.util.Log
import java.util.Stack
import java.util.concurrent.CopyOnWriteArrayList

/**
 * @author huangguocheng
 * @data 2023/6/12
 */
@SuppressLint("StaticFieldLeak")
object ActivityManager : Application.ActivityLifecycleCallbacks {
    interface OnAppBackGroundListener {
        fun onAppBackground()

        fun onAppForeground()

        fun onAllActivityDestroyed()
    }

    private const val TAG = "ActivityManager"

    private val activityStack: Stack<Activity> = Stack()
    private val startedActivityStack: Stack<Activity> = Stack()

    private var isBackground: Boolean = true

    private var lastForegroundTime: Long = 0L

    var currentActivity: Activity? = null
        private set

    val activityCount: Int?
        get() = activityStack.size


    fun init(application: Application) {
        application.registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        currentActivity = activity
        pushActivity(activity)
        Log.d(TAG, "create $activity ${savedInstanceState == null}")
    }

    override fun onActivityStarted(activity: Activity) {
        startedActivityStack.add(activity)
        Log.d(TAG, "start $activity")
    }

    @Synchronized
    override fun onActivityResumed(activity: Activity) {
        currentActivity = activity
        if (isBackground) {
            lastForegroundTime = System.currentTimeMillis()
            isBackground = false
            appBackgroundListeners.forEach {
                it.onAppForeground()
            }
        }
        Log.d(TAG, "resume $activity")
    }

    override fun onActivityPaused(activity: Activity) {
        Log.d(TAG, "pause $activity")
    }

    @Synchronized
    override fun onActivityStopped(activity: Activity) {

        startedActivityStack.remove(activity)
        if (!isBackground && startedActivityStack.isEmpty()) {
            isBackground = true
            appBackgroundListeners.forEach {
                it.onAppBackground()
            }
        }
        Log.d(TAG, "stop $activity")
    }

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {
    }

    override fun onActivityDestroyed(activity: Activity) {
        if (currentActivity == activity) {
            currentActivity = null
        }
        popActivity(activity)
        if (activityStack.isEmpty()) {
            appBackgroundListeners.forEach {
                it.onAllActivityDestroyed()
            }
        }
        Log.d(TAG, "destroy $activity")
    }

    fun getPreviousActivity(curActivity: Activity): Activity? {
        var index = activityStack.size - 1
        var findCurActivity = false
        while (index >= 0) {
            if (findCurActivity) {
                val preActiveActivity = activityStack.get(index)
                if (preActiveActivity != null && !preActiveActivity.isFinishing) {
                    return preActiveActivity
                }
            } else if (activityStack[index] === curActivity) {
                findCurActivity = true
            }
            index--
        }

        return null
    }

    fun getActivityList(): List<Activity> {
        return activityStack.toList()
    }

    private fun pushActivity(activity: Activity) {
        activityStack.add(activity)
    }

    private fun popActivity(activity: Activity) {
        activityStack.remove(activity)
    }

    fun endActivity(activity: Activity?) {
        activity?.let {
            it.finish()
            activityStack.remove(it)
        }
    }

    fun backPressActivity(clazz: Class<out Activity>) {
        for (activity in activityStack) {
            if (activity.javaClass == clazz) {
                activity.onBackPressed()
                activityStack.remove(activity)
                break
            }
        }
    }

    fun finishAllActivities() {
        val iterator = activityStack.iterator()
        while (iterator.hasNext()) {
            val activity = iterator.next()
            activity.finish()
        }
        activityStack.clear()
    }

    fun finishActivitiesExcept(clazz: Class<*>) {
        val activitiesToFinish = ArrayList(activityStack)
        val iterator = activitiesToFinish.iterator()
        while (iterator.hasNext()) {
            val activity = iterator.next()
            if (!clazz.isInstance(activity)) {
                activity.finish()
                iterator.remove()
            }
        }
    }

    fun containActivity(clazz: Class<out Activity>): Boolean {
        for (activity in activityStack) {
            if (activity.javaClass == clazz) {
                return true
            }
        }
        return false
    }

    fun finishFirstTopActivity(clazz: Class<out Activity>) {
        val activity = activityStack.lastOrNull { it.javaClass == clazz }
        activity?.let {
            it.finish()
            activityStack.remove(it)
        }
    }

    fun isAppBackground(): Boolean {
        return isBackground
    }

    fun lastForegroundTime(): Long {
        return lastForegroundTime
    }

    private val appBackgroundListeners = CopyOnWriteArrayList<OnAppBackGroundListener>()

    @Synchronized
    fun addAppBackGroundListener(listener: OnAppBackGroundListener) {
        listener.takeIf { !appBackgroundListeners.contains(it) }?.let {
            appBackgroundListeners.add(it)
        }
    }

    @Synchronized
    fun removeAppBackGroundListener(listener: OnAppBackGroundListener) {
        listener.takeIf { appBackgroundListeners.contains(it) }?.let {
            appBackgroundListeners.remove(it)
        }
    }
}
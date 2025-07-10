package com.bytedance.ai.multimodal.shopping.page.shopping

import android.app.Activity.RESULT_OK
import android.content.Context.VIBRATOR_SERVICE
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Point
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.MediaStore
import android.text.method.ScrollingMovementMethod
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult
import androidx.annotation.Keep
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.Lifecycle
import com.bytedance.ai.multimodal.common.base.DummyStreamingString
import com.bytedance.ai.multimodal.common.base.StreamingString
import com.bytedance.ai.multimodal.common.log.FLogger
import com.bytedance.ai.multimodal.common.utils.ThreadUtils
import com.bytedance.ai.multimodal.common.utils.ToastUtil
import com.bytedance.ai.multimodal.visual.realtime.RealtimeServiceState
import com.bytedance.ai.multimodal.visual.realtime.StateListener
import com.bytedance.ai.multimodal.common.utils.gone
import com.bytedance.ai.multimodal.common.utils.visible
import com.bytedance.ai.multimodal.tts.api.TTSService
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import com.bytedance.ai.multimodal.shopping.R
import com.bytedance.ai.multimodal.shopping.view.AbsVolcCameraOverlayFragment
import com.bytedance.ai.multimodal.shopping.AppCore
import com.bytedance.ai.multimodal.shopping.CameraLiveWorkflow
import com.bytedance.ai.multimodal.shopping.CameraShotWorkflow
import com.bytedance.ai.multimodal.shopping.core.utils.SettingsPreference
import com.bytedance.ai.multimodal.shopping.databinding.LayoutCameraShotBinding
import com.bytedance.ai.multimodal.shopping.databinding.LayoutGuideLiveSolveBinding
import com.bytedance.ai.multimodal.shopping.databinding.LayoutLiveCallBinding
import com.bytedance.ai.multimodal.shopping.view.BreathingAnimationView
import com.bytedance.ai.multimodal.shopping.view.CameraGuidanceOverlay
import com.bytedance.ai.multimodal.shopping.vision.camera.OnSelectListener
import com.bytedance.ai.multimodal.shopping.vision.camera.WorkflowModel
import com.bytedance.ai.multimodal.visual.vision.cache.bean.DetectedObjectRecord
import com.bytedance.ai.multimodal.vlm.api.VLMChatProvider
import com.bytedance.ai.multimodal.vlm.api.tools.AITool
import com.bytedance.ai.multimodal.vlm.api.tools.AIToolFunction
import com.bytedance.ai.multimodal.vlm.api.tools.AIToolParam
import com.hjq.permissions.Permission
import com.hjq.permissions.XXPermissions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar

class ShoppingFragment : AbsVolcCameraOverlayFragment(), StateListener {

    companion object {
        private const val TAG = "ShoppingFragment"

        private const val MODE_LIVE_SHOPPING = 0
        private const val MODE_PHOTO_SHOPPING = 1
        private const val GUIDE_SUFFIX = "_guide_need"
        private const val TIME_SUFFIX = "_guide_time"

        private val CAMERA_MODE_DATASET = listOf(
            "视频购物" to "live_shopping",
            "拍照购物" to "photo_shopping",
        )
    }

    private lateinit var liveCallBinding: LayoutLiveCallBinding
    private lateinit var cameraShotBinding: LayoutCameraShotBinding

    private val cameraShotWorkflow: CameraShotWorkflow by activityViewModels()
    private val cameraLiveWorkflow: CameraLiveWorkflow by activityViewModels()

    private var currentModePosition = MODE_PHOTO_SHOPPING

    private lateinit var albumResultLauncher: ActivityResultLauncher<Intent>

    private var overlayView: CameraGuidanceOverlay? = null
    private var onNextClicked = false

    private val shoppingTools = ShoppingTools()

    private val onSelectListener = object : OnSelectListener {
        override fun invoke(originWidth: Int, originHeight: Int, point: Point?, rectangle: Rect?) {
            FLogger.i(TAG, "onSelect originWidth = $originWidth, originHeight = $originHeight point = $point, rect = $rectangle")
            //圈选功能回调
            CoroutineScope(Dispatchers.IO).launch {
                Log.d(TAG, "point = $point, rect = $rectangle")
                if (XXPermissions.isGranted(requireContext(), Permission.CAMERA, Permission.RECORD_AUDIO)) {
                    imageCapture()?.let { cameraShotWorkflow.enqueueBitmapJob(getCurrentCameraMode(),null, it, point, rectangle) }
                } else {
                    ToastUtil.showToast("请先授权相机和麦克风权限")
                }
            }
        }
    }

    // key: mode, value: if need guide
    private val needGuide = mutableMapOf(
        MODE_LIVE_SHOPPING to getGuideNeedStatus(MODE_LIVE_SHOPPING),
        MODE_PHOTO_SHOPPING to getGuideNeedStatus(MODE_PHOTO_SHOPPING),
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 相册回调
        albumResultLauncher = registerForActivityResult(StartActivityForResult()) { result: ActivityResult ->
            Log.i(TAG, "ActivityResult resultCode=${result.resultCode} data=${result.data?.data}")
            if (result.resultCode == RESULT_OK) {
                result.data?.data?.also {uri ->
                    val parseFromAlbum = CoroutineScope(Dispatchers.IO).async {
                        runCatching {
                            val bitmap = MediaStore.Images.Media.getBitmap(AppCore.inst.contentResolver, uri)
                            BitMapWithPosition(bitmap, null, uri)
                        }.onFailure {
                            withContext(Dispatchers.Main) {
                                Log.w(TAG, "read image failed: ${it.message}", it)
                                Toast.makeText(context, "read image failed: ${it.message}", Toast.LENGTH_SHORT).show()
                            }
                        }.getOrNull()
                    }
                    cameraShotWorkflow.enqueueBitmapJob(getCurrentCameraMode(), null, parseFromAlbum)
                } ?: run {
                    Toast.makeText(context, "读取照片失败", Toast.LENGTH_LONG).show()
                }
            } else {
                Toast.makeText(context, "选择照片失败", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun getGuideSPKey(mode: Int): String {
        return when(mode) {
            MODE_LIVE_SHOPPING -> "live_shopping"
            MODE_PHOTO_SHOPPING -> "photo_shopping"
            else -> "unknown"
        }
    }

    private fun getGuideNeedStatus(mode: Int): Boolean {
        val prefs = SettingsPreference.getGlobalPreference()
        val modeName = getGuideSPKey(mode)

        val lastTime = prefs.getLong("$modeName$TIME_SUFFIX", 0)
        val calendar = Calendar.getInstance().apply {
            timeInMillis = lastTime
        }

        // 判断是否同一天
        val isSameDay = Calendar.getInstance().run {
            get(Calendar.DAY_OF_YEAR) == calendar.get(Calendar.DAY_OF_YEAR) &&
                    get(Calendar.YEAR) == calendar.get(Calendar.YEAR)
        }

        return if (!isSameDay) {
            prefs.edit().putBoolean("$modeName$GUIDE_SUFFIX", true).apply()
            true
        } else {
            prefs.getBoolean("$modeName$GUIDE_SUFFIX", true)
        }
    }

    override fun onPause() {
        FLogger.i(TAG, "onPause")
        super.onPause()
        cameraLiveWorkflow.abortCurrentTask(true)
        if (currentModePosition == MODE_LIVE_SHOPPING) {
            stopLiveCall()
        }
    }

    override fun onResume() {
        FLogger.i(TAG, "onResume")
        super.onResume()
        if (onNextClicked) {
            dissmissGuideOverlay(binding.root, currentModePosition)
            onNextClicked = false
        }
        liveCallBinding.tvChat.text = ""
        cameraLiveWorkflow.resetFrameInterceptDelegate()
        cameraLiveWorkflow.startListening()
        if (currentModePosition == MODE_LIVE_SHOPPING && needGuide[currentModePosition] == false) {
            startLiveCall(this, false)
        }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        cameraShotBinding = LayoutCameraShotBinding.bind(binding.root)
        liveCallBinding = LayoutLiveCallBinding.bind(binding.root)
        setupView()
    }

    override fun onCameraModeChange(data: Pair<String, String>, position: Int) {
        currentModePosition = position
        setupView()
    }

    private fun setupView() {
        when (currentModePosition) {
            MODE_LIVE_SHOPPING -> {
                initLiveLayout()
                LayoutGuideLiveSolveBinding.inflate(layoutInflater, getEmptyGuideLayoutContainer())
                overlayGraph.enableSelectObject(true, onSelectListener)
                playOpeningWords()
            }
            MODE_PHOTO_SHOPPING -> {
                initShotLayout()
                getEmptyGuideLayoutContainer().removeAllViews()
                overlayGraph.enableSelectObject(false, onSelectListener)
                // 从实时对话切过来时要停止
                stopLiveCall()
            }
        }

        if (needGuide[currentModePosition] == true) {
            workflowModel.userGuideMaskStatus.value = WorkflowModel.UserGuideMaskState(true, currentModePosition)
        }
        cameraShotBinding.root.post {
            tryShowGuid(currentModePosition)
        }
        binding.btnGuideSample.setOnClickListener {
            FLogger.i(TAG, "btnGuideSample click")
            needGuide[currentModePosition] = true
            tryShowGuid(currentModePosition)
            stopLiveCall()
        }
        binding.btnFlap.setOnClickListener {
            cameraController?.flipCamera()
        }
        workflowModel.apply {
            userGuideMaskStatus.observe(viewLifecycleOwner) { status ->
                if (status.mode == MODE_LIVE_SHOPPING) {
                    val visible = if (status.isShowing) View.INVISIBLE else View.VISIBLE
                    binding.layoutGuideContainer.findViewById<TextView>(R.id.tv_guide)?.visibility = visible
                } else if (status.mode == MODE_PHOTO_SHOPPING) {
                    val visible = if (status.isShowing) View.INVISIBLE else View.VISIBLE
                    binding.layoutGuideContainer.findViewById<View>(R.id.layout_guide)?.visibility = visible
                }
            }
        }
    }

    private fun initLiveLayout() {
        liveCallBinding.liveCallContainer.visible()
        cameraShotBinding.cameraControlContainer.gone()

        liveCallBinding.ivRainbow.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, 24 * resources.displayMetrics.density)
            }
        }
        liveCallBinding.ivRainbow.clipToOutline = true
        liveCallBinding.tvChat.movementMethod = ScrollingMovementMethod.getInstance()
    }

    private fun vibrate() {
        // 添加震动效果
        (context?.getSystemService(VIBRATOR_SERVICE) as? Vibrator)?.let { vibrator ->
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(50)
            }
        }
    }

    private fun initShotLayout() {
        liveCallBinding.liveCallContainer.gone()
        cameraShotBinding.cameraControlContainer.visible()

        cameraShotBinding.btnShot.setOnClickListener {
            vibrate()
            if (XXPermissions.isGranted(requireContext(), Permission.CAMERA, Permission.RECORD_AUDIO)) {
                 imageCapture()?.let { cameraShotWorkflow.enqueueBitmapJob(getCurrentCameraMode(),null, it) }
            } else {
                ToastUtil.showToast("请先授权相机和麦克风权限")
            }
        }
        cameraShotBinding.btnAlbum.setOnClickListener {
            cameraShotWorkflow.openAlbum(albumResultLauncher)
        }
        (cameraShotBinding.btnShot.drawable as? LayerDrawable)?.apply {
            (getDrawable(1) as? GradientDrawable)?.apply {
                setColor(getPrimaryColor())
            }
        }
    }

    private fun tryShowGuid(mode: Int) {
        FLogger.i(TAG, "showGuid overlayView=$overlayView needGuid=${needGuide[mode]}")

        if (needGuide[mode] == false) {
            if (overlayView != null) {
                dissmissGuideOverlay(binding.root, mode)
            }
            return
        }
        // 获取相机按钮的位置信息
        val cameraButton = cameraShotBinding.btnShot
        val location = IntArray(2)
        cameraButton.getLocationInWindow(location)
        val centerX = location[0] + cameraButton.width / 2f
        val centerY = location[1] + cameraButton.height / 2f
        val radius = Math.min(cameraButton.width, cameraButton.height) / 2f

        FLogger.i(TAG, "showGuid setCameraButtonPosition=$centerX $centerY $radius")
        // 创建并添加引导覆盖层
        activity?.let {activity ->
            val rootView = binding.root
            if (overlayView == null) {
                overlayView = CameraGuidanceOverlay(activity).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
                rootView.addView(overlayView)
            }
            when (mode) {
                MODE_LIVE_SHOPPING -> {
                    overlayView?.setSampleImage(R.drawable.img_guide_double_click, 0.5f)
                    overlayView?.setOnClickListener {
                        dissmissGuideOverlay(rootView, mode)
                        if (openningWordsJob?.isCompleted != false) {
                            startLiveCall(this)
                        }
                    }
                    overlayView?.setCloseBtnVisible(false)
                    overlayView?.setCameraButtonPosition(0f, 0f, 0f)
                }
                MODE_PHOTO_SHOPPING -> {
                    overlayView?.setSampleImage(R.drawable.img_guide_shopping, 0.4f)
                    overlayView?.setTipResId(R.drawable.ic_guide_tip_shopping)
                    overlayView?.setCloseBtnVisible(true)
                    overlayView?.setCameraButtonPosition(centerX, centerY, radius)
                }
                else -> {}
            }
            workflowModel.userGuideMaskStatus.value = WorkflowModel.UserGuideMaskState(true, mode)
            overlayView?.setOnCloseListener {
                dissmissGuideOverlay(rootView, mode)
            }
            overlayView?.setOnNextListener {
                FLogger.i(TAG, "onNext $mode")
                vibrate()
                onNextClicked = true
                val bitmapFuture = CoroutineScope(Dispatchers.IO).async {
                    context?.let { context ->
                        val bm = BitmapFactory.decodeResource(
                            context.resources,
                            R.drawable.img_guide_shopping
                        )
                        BitMapWithPosition(bm)
                    } ?: null
                }
                cameraShotWorkflow.enqueueBitmapJob(getCurrentCameraMode(),null, bitmapFuture, null, null)
            }
        }
    }

    private fun getGuideImageDetectResult(): ArrayList<DetectedObjectRecord> {
        val detectResult = ArrayList<DetectedObjectRecord>()
        val detectRecord = DetectedObjectRecord(
            366f, 514f, 430f, 680f, "水杯"
        )
        detectResult.add(detectRecord)
        return detectResult
    }

    private fun dissmissGuideOverlay(rootView: ViewGroup, mode: Int) {
        overlayView?.let {
            rootView.removeView(it)
            workflowModel.userGuideMaskStatus.value = WorkflowModel.UserGuideMaskState(false, mode)
        }
        overlayView = null
        needGuide[mode] = false
        // 存储状态和当前时间
        val modeName = getGuideSPKey(mode)
        SettingsPreference.getGlobalPreference().edit()
            .putBoolean("$modeName$GUIDE_SUFFIX", false)
            .putLong("$modeName$TIME_SUFFIX", System.currentTimeMillis())
            .apply()
    }

    override fun getCurrentCameraModeIndex(): Int {
        return currentModePosition
    }

    override fun getCameraModeSet(): List<Pair<String, String>> {
        return CAMERA_MODE_DATASET
    }

    override fun getTitle(): String {
        return "拍照购物"
    }

    override fun getPrimaryColor(): Int {
        return Color.parseColor("#0AB76A")
    }

    override fun onStateChanged(newState: RealtimeServiceState) {
        when (newState) {
            is RealtimeServiceState.Idle -> {
                liveCallBinding.breathingAnimationView.setState(BreathingAnimationView.STATE_IDLE)
            }

            is RealtimeServiceState.Listening -> {
                liveCallBinding.breathingAnimationView.setState(BreathingAnimationView.STATE_MIC_RECORDING)
            }

            is RealtimeServiceState.Error -> {
                liveCallBinding.breathingAnimationView.setState(BreathingAnimationView.STATE_ERROR)
            }

            is RealtimeServiceState.Talking -> {
                liveCallBinding.breathingAnimationView.setState(BreathingAnimationView.STATE_BREATHING)
            }

            else -> {

            }
        }
    }

    override fun llmResponse(string: StreamingString) {
        string.onStreamingString { totalText, newText, isFinish ->
            if (totalText.isNotEmpty() && lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                FLogger.i("orihgc", "llmResponse totalText=$totalText")
                ThreadUtils.runOnMain {
                    liveCallBinding.tvChat.text = totalText
                }
            }
        }
    }

    override fun asrResponse(string: StreamingString) {
        string.onStreamingString { totalText, newText, isFinish ->
            FLogger.i("orihgc", "asrResponse:${totalText}")
            if (totalText.isNotEmpty()) {
                ThreadUtils.runOnMain {
                    liveCallBinding.tvChat.text = totalText
                }
            }
        }
    }

    override fun onAudioInput(data: ByteArray) {
        liveCallBinding.breathingAnimationView.receiveMicrophoneData(data)
    }

    private fun startLiveCall(listener: StateListener, checkLifecycle: Boolean = true) {
        FLogger.i(TAG, "startLiveCall needGuide=${needGuide[currentModePosition]} lifecycle.currentState=${lifecycle.currentState}")
        if (checkLifecycle && !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            FLogger.w(TAG, "startLiveCall, not at least resumed, return")
            return
        }
        if (needGuide[currentModePosition] == true) {
            FLogger.w(TAG, "startLiveCall, in guide, return")
            return
        }
        stopLiveCall()
        context?.apply {
            //注册AITool，vlm会自行调用
            VLMChatProvider.globalVlmChat?.aiToolContext?.registerAITool(shoppingTools)
            cameraLiveWorkflow.startAssistant(this, listener)
        }
//        val processor = MultiObjectProcessor(overlayGraph, workflowModel)
//        processor.bindImageCacheDelegate(cameraLiveWorkflow.frameInterceptDelegate)
//        cameraController?.bindFrameProcessor(processor)
    }

    private fun stopLiveCall() {
        context?.apply {
            cameraLiveWorkflow.releaseAssistant(this)
        }
        //反注册AITool，vlm会自行调用
        VLMChatProvider.globalVlmChat?.aiToolContext?.unregisterAITool(shoppingTools)
    }


    var openningWordsJob: Job? = null
    private fun playOpeningWords() {
        val openningWords = "我是你的购物助手，你可以对准商品，画个圈试试哦。"
        liveCallBinding.tvChat.text = openningWords
        CoroutineScope(Dispatchers.IO).launch {
            openningWordsJob = TTSService.getInstance().playStreaming(DummyStreamingString(openningWords))
            openningWordsJob?.join()
            openningWordsJob = null
            if (currentModePosition == MODE_LIVE_SHOPPING) {
                CoroutineScope(Dispatchers.Main).launch {
                    startLiveCall(this@ShoppingFragment)
                }
            }
        }
    }

    @Keep
    inner class ShoppingTools : AITool {
        @AIToolFunction(
            name = "photoShootAndShopping",
            description = "作为购物助手解答各种购物和商品相关的问题，当用户明确要求需要购买或询问价格时，调用此工具跳转购物页面，调用此工具时不需要额外过多解释。如果仅聊天，则不调用此工具"
        )
        fun photoShootAndShopping(@AIToolParam(description = "用户原始的提问") originQuery: String) {
            CoroutineScope(Dispatchers.IO).launch {
                val imageCapture = cameraController?.imageCapture(false)?.await() ?: return@launch
                cameraShotWorkflow.enqueueBitmap(getCurrentCameraMode(), imageCapture, originQuery)
            }
        }
    }
}
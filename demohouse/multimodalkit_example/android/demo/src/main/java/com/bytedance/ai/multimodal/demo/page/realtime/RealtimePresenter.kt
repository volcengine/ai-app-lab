package com.bytedance.ai.multimodal.demo.page.realtime

import android.content.Context
import android.view.LayoutInflater
import android.widget.FrameLayout
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import com.bytedance.ai.multimodal.common.base.StreamingString
import com.bytedance.ai.multimodal.common.utils.ThreadUtils
import com.bytedance.ai.multimodal.common.utils.ToastUtil
import com.bytedance.ai.multimodal.common.utils.gone
import com.bytedance.ai.multimodal.common.utils.visible
import com.bytedance.ai.multimodal.demo.base.ICameraController
import com.bytedance.ai.multimodal.demo.base.VisualAssistant
import com.bytedance.ai.multimodal.demo.core.utils.SettingsPreference
import com.bytedance.ai.multimodal.demo.databinding.ActivityCameraPopupToolbarBinding
import com.bytedance.ai.multimodal.demo.databinding.FragmentRealtimeBinding
import com.bytedance.ai.multimodal.demo.databinding.LayoutRealtimeOperationBinding
import com.bytedance.ai.multimodal.demo.view.popup.base.AbsBottomSheetFragment
import com.bytedance.ai.multimodal.demo.view.popup.base.AbsOverlayFragment
import com.bytedance.ai.multimodal.demo.view.popup.base.AbsPopupPresenter
import com.bytedance.ai.multimodal.demo.view.popup.bottomsheet.ChatUIBottomSheetFragment
import com.bytedance.ai.multimodal.demo.vision.camera.WorkflowModel
import com.bytedance.ai.multimodal.visual.realtime.RealtimeServiceState
import com.bytedance.ai.multimodal.visual.realtime.StateListener
import com.bytedance.ai.multimodal.visual.realtime.videosource.FrameInterceptDelegate
import com.bytedance.ai.multimodal.visual.realtime.videosource.FrameInterceptDelegateConfig

/**
 * 实时对话业务
 */
class RealtimePresenter: AbsPopupPresenter(), StateListener, DefaultLifecycleObserver {
    companion object {
        private const val TAG = "RealtimePresenter"
    }

    private var operationBinding: LayoutRealtimeOperationBinding? = null
    private var toolbarBinding: ActivityCameraPopupToolbarBinding? = null

    //接收图片数据
    private val frameInterceptDelegate: FrameInterceptDelegate = FrameInterceptDelegate(true)
    //实时音视频对话入口
    private var assistant: VisualAssistant? = null
    //与CameraPreviewFragment关联
    private var cameraController: ICameraController? = null

    //底部弹出Fragment
    private val subFragment: ChatUIBottomSheetFragment by lazy {
        ChatUIBottomSheetFragment()
    }

    //相机覆盖层Fragment
    val sourceFragment: AbsOverlayFragment by lazy {
        val fragment = RealtimeFragment(frameInterceptDelegate)
        fragment.lifecycle.addObserver(this)
        fragment.viewLifecycleOwnerLiveData.observe(fragment) { t ->
            if (t != null) {
                onCreateView(fragment)
            }
        }
        fragment
    }

    private val cameraWorkflowModel: WorkflowModel by sourceFragment.activityViewModels()

    private fun onCreateView(fragment: AbsOverlayFragment) {
        createFragment()
        //新session
        cameraWorkflowModel.cameraState.observe(fragment.viewLifecycleOwner) { state ->
            when (state) {
                is WorkflowModel.CameraState.ON_BIND -> {
                    this.cameraController = state.cameraController
                }
                else -> {}
            }
        }

        startAssistant(fragment.requireContext())
    }

    /**
     * 启动实时音视频对话
     */
    private fun startAssistant(context: Context) {
        assistant = VisualAssistant.startService(context, frameInterceptDelegate, this)
    }

    /**
     * 结束音视频对话
     */
    private fun releaseAssistant(context: Context) {
        assistant?.clientRealtimeCore?.release(context)
        assistant = null
    }

    private fun createFragment() {
        sourceFragment.viewLifecycleOwnerLiveData.observe(sourceFragment, object : Observer<LifecycleOwner> {
            override fun onChanged(t: LifecycleOwner) {
                val view = sourceFragment.view ?: return
                FragmentRealtimeBinding.bind(view).also {
                    toolbarBinding = it.toolbar
                }
                initToolbarView()
                sourceFragment.viewLifecycleOwnerLiveData.removeObserver(this)
            }
        })
    }

    override fun initOperationContainer(container: FrameLayout) {
        operationBinding = LayoutRealtimeOperationBinding.inflate(LayoutInflater.from(container.context), container)
    }

    private fun initToolbarView() {
        toolbarBinding?.tvTitle?.text = "视频通话"
        operationBinding?.btnStop?.setOnClickListener {
            assistant?.clientRealtimeCore?.abortCurrentTask()
        }
        toolbarBinding?.btnClose?.setOnClickListener {
            sourceFragment.activity?.onBackPressed()
        }
        toolbarBinding?.btnRestart?.setOnClickListener {
            restartVLM()
        }
    }

    private fun restartVLM() {
        releaseAssistant(sourceFragment.requireContext())
        startAssistant(sourceFragment.requireContext())
    }

    override fun onDestroy(owner: LifecycleOwner) {
        releaseAssistant(sourceFragment.requireContext())
        cameraController?.resumeCameraPreview()
    }

    override fun onPause(owner: LifecycleOwner) {
        super.onPause(owner)
        //退后台时暂停tts和asr
        assistant?.clientRealtimeCore?.abortCurrentTask(true)
    }

    override fun onResume(owner: LifecycleOwner) {
        resetFrameInterceptDelegate()
        assistant?.clientRealtimeCore?.startMic()
    }

    override fun getBottomSheetFragment(): AbsBottomSheetFragment {
        return subFragment
    }

    override fun getOverlayFragment(): AbsOverlayFragment {
        return sourceFragment
    }

    /**
     * 帧采集配置
     */
    private fun resetFrameInterceptDelegate() {
        // 采集帧间隔机制
        val frameInterval =
            SettingsPreference.getGlobalPreference().getString("frame_interval", null)
                ?.toIntOrNull()
        val frameIntervalSecond =
            SettingsPreference.getGlobalPreference().getInt("frame_interval_second", 2)

        //相似度检查
        val enableSimilarityFilter = SettingsPreference.getGlobalPreference()
            .getBoolean("enable_similarity_frame_filter", false)
        val similarityThreshold =
            SettingsPreference.getGlobalPreference().getString("similarity_threshold", "0.8")
                ?.toFloatOrNull() ?: 0.8f

        // 配置采集器
        frameInterceptDelegate.setInterceptors(
            FrameInterceptDelegateConfig(
                frameInterval = frameInterval ?: (frameIntervalSecond * 1000),
                enableSimilarityFilter = enableSimilarityFilter,
                similarityThreshold = similarityThreshold
            )
        )
    }

    /**
     * 对话状态发生变化
     */
    override fun onStateChanged(newState: RealtimeServiceState) {
        val binding = toolbarBinding ?: return
        with(binding) {
            when (newState) {
                is RealtimeServiceState.NotStarted -> {
                    tvHint.text = "未连接"
                    operationBinding?.btnStop?.gone()
                }

                is RealtimeServiceState.Starting -> {
                    tvHint.text = "连接中"
                    operationBinding?.btnStop?.gone()
                    btnRestart.gone()
                }

                is RealtimeServiceState.Idle -> {
                    tvHint.text = "待机中"
                    operationBinding?.btnStop?.gone()
                    btnRestart.gone()
                }

                is RealtimeServiceState.Listening -> {
                    tvHint.text = "请说话"
                    operationBinding?.btnStop?.gone()
                    btnRestart.gone()
                }

                is RealtimeServiceState.Talking -> {
                    tvHint.text = "正在回复"
                    operationBinding?.btnStop?.visible()
                    btnRestart.gone()
                }

                is RealtimeServiceState.Handling -> {
                    tvHint.text = "正在思考"
                    operationBinding?.btnStop?.visible()
                    btnRestart.gone()
                }

                is RealtimeServiceState.Error -> {
                    tvHint.text = "出现错误"
                    operationBinding?.btnStop?.gone()
                    btnRestart.visible()
                    ToastUtil.showToast("出现错误 ${newState.errorCode}, ${newState.errorMessage}")
                }
            }
        }
    }

    /**
     * 大模型回复
     */
    override fun llmResponse(string: StreamingString) {
        ThreadUtils.runOnMain {
            subFragment.llmResponse(string)
        }
    }

    /**
     * 收到语音转文本回复
     */
    override fun asrResponse(string: StreamingString) {
        subFragment.asrResponse(string)
    }

    /**
     * 音频采集PCM数据回调
     */
    override fun onAudioInput(data: ByteArray) {
    }

    /**
     * 大模型回复句子开始播放TTS
     */
    override fun onSentencePlayStart(sentence: String) {
    }
}
# Multimodal-kit Android

## 运行示例工程

### 1. 环境准备

若体验ASR/TTS/VLM等能力，请参阅 [TTSASRInitializer](demo/src/main/java/com/bytedance/ai/multimodal/demo/init/TTSASRInitializer.kt)、[VLMInitializer](demo/src/main/java/com/bytedance/ai/multimodal/demo/init/VLMInitializer.kt)、[DefaultConfig](demo/src/external/java/com/bytedance/ai/multimodal/demo/init/DefaultConfig.kt) 完成配置。

若体验端侧能力，需分别下载物体分割([MobileSAM](https://github.com/ChaoningZhang/MobileSAM))/物体识别([RT-DETR](https://github.com/lyuwenyu/RT-DETR))模型文件并放置在Android工程 [`demo/src/main/assets`](demo/src/main/assets) 目录下，使用对应模型文件时需遵守其许可证要求。
模型文件如下：
- [mobile_sam_decoder.onnx](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/mobile_sam_decoder.onnx)
- [mobile_sam_encoder.onnx](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/mobile_sam_encoder.onnx)
- [detr_v2_s.onnx](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/rt-detr_v2_s.onnx)

## 接入多模态SDK

## 声明

- 本SDK初始化不会获取个人信息。请务必在用户同意您App中的隐私政策后,再进行本SDK的初始化。
- 请在具体功能场景时，再调用相应功能接口。

### 1. 安装依赖

请在根目录的`build.gradle`中声明火山引擎SDK官方Maven地址：

  ```groovy
  maven {
      url "https://artifact.bytedance.com/repository/Volcengine/"
  }
  ```

请在对应App module下的`build.gradle`中按需引入如下所需能力的依赖：

  ```groovy
  def multimodalKitVersion = "1.0.0-rc.5"//请使用最新版本
  
  //公共模块
  implementation "com.bytedance.ai:multimodalkit-common-tob:${multimodalKitVersion}"
  
  //ASR能力
  implementation "com.bytedance.ai:multimodalkit-asr-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-asr-volcano-tob:${multimodalKitVersion}"
  
  //TTS能力
  implementation "com.bytedance.ai:multimodalkit-tts-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-tts-volcano-tob:${multimodalKitVersion}"
  
  //图片识别能力
  implementation "com.bytedance.ai:multimodalkit-object-detect-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-object-detect-rtdetr-tob:${multimodalKitVersion}"
  
  //图片分割能力
  implementation "com.bytedance.ai:multimodalkit-segmentation-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-segmentation-common-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-segmentation-mobilesam-tob:${multimodalKitVersion}"
  
  //图片处理算法
  implementation "com.bytedance.ai:multimodalkit-algorithm-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-algorithm-opencv-tob:${multimodalKitVersion}"
  
  //加载onnx格式模型文件依赖
  implementation "com.bytedance.ai:multimodalkit-inference-onnx-tob:${multimodalKitVersion}"
  
  //访问大模型能力
  implementation "com.bytedance.ai:multimodalkit-vlm-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-vlm-ark-tob:${multimodalKitVersion}"
  
  //和大模型实时语音通话能力
  implementation "com.bytedance.ai:multimodalkit-visual-realtime-api-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-visual-realtime-local-tob:${multimodalKitVersion}"
  
  //前端通过JSB调用原子能力
  //webview使用JSB依赖项
  api "com.bytedance.ai:multimodalkit-web-bridge-tob:${multimodalKitVersion}"
  //tts能力对应JSB
  implementation "com.bytedance.ai:multimodalkit-tts-bridge-tob:${multimodalKitVersion}"
  //asr能力对应JSB
  implementation "com.bytedance.ai:multimodalkit-asr-bridge-tob:${multimodalKitVersion}"
  //大模型交互JSB
  implementation "com.bytedance.ai:multimodalkit-vlm-bridge-tob:${multimodalKitVersion}"
  //图片能力JSB
  implementation "com.bytedance.ai:multimodalkit-visual-image-tob:${multimodalKitVersion}"
  implementation "com.bytedance.ai:multimodalkit-visual-bridge-tob:${multimodalKitVersion}"
  
  //bridge common
  implementation "com.bytedance.ai:applet-bridge-tob:0.0.1-rc.2"
  ```

`AndroidManifest` 中需要添加如下权限声明以确保能力正常使用。其中ASR和TTS等联网能力需要网络相关权限，ASR需要单独申请录音权限

  ```xml
  <!-- 网络相关 -->
  <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission  android:name="android.permission.INTERNET" />
  <!-- 语音转文本功能需要 -->
  <uses-permission   android:name="android.permission.RECORD_AUDIO" />
  ```

### 2. 初始化SDK

请参考工程中的[VolcEngineApp.kt](demo/src/main/java/com/bytedance/ai/multimodal/demo/VolcEngineApp.kt)的initMultimodalKit函数完成初始化。

#### 2.1 初始化App对应的能力实现

  ```kotlin
  val hostAbilities = object: IHostAbilities {
      override fun getLogger(): ILogger {
          //日志打印
          return object : ILogger {
              override fun v(tag: String, msg: String?) {
                  
              }
              override fun d(tag: String, msg: String?) {
                  
              }
              override fun i(tag: String, msg: String?) {
                  
              }
              override fun w(tag: String, msg: String?) {
                  
              }
  
              override fun w(tag: String, msg: String?, tr: Throwable?) {
                 
              }
  
              override fun w(tag: String, tr: Throwable?) {
                  
              }
  
              override fun e(tag: String, msg: String?) {
                  
              }
  
              override fun e(tag: String, msg: String?, tr: Throwable?) {
                  
              }
  
              override fun getDirPath(): String {
                  
              }
  
              override fun uploadAllLog(scene: String, unit: ((Boolean) -> Unit)?) {
                  
              }
          }
      }
  
     //处理多模态SDK内部权限申请
      override fun getPermissionHandler(): IPermissionHandler {
          
      }
  
      //当前设备唯一标识
      override fun getDeviceId(): String {
          
      }
  
     //当前app对应版本号，例如1.0.0
      override fun getAppVersionName(): String {
         
      }
  }
  ```
#### 2.2 实始化IModelDownloader实现[可选]

> 用于物体识别对应的模型文件的加载，需要接入方自行实现。如果使用了物体识别原子能力，需要实现。

  ```kotlin
  val modalDownloader = object: IModelDownloader {
      suspend fun loadModelAsFilePath(model: String): String? {
         //根据模型名称加载模型，返回模型文件对应的本地路径 
      }
  
      suspend fun loadModelAsByteBuffer(model: String): ByteBuffer? {
          //根据模型名称加载模型，返回模型数据
      }
  }
  ```

#### 2.3 初始化多模态SDK

  ```kotlin
  val config = MultiModalKitConfig.Builder(hostAbilities)
      .modelDownloader(modalDownloader)
      .build()
  val application = ... //当前应用对应的Application   
  MultimodalKit.init(application, config)
      .enableOpenCV(...)//注入图像处理的实现
      .enableObjectDetector(...)//注入图片物体识别能力的实现
      .enableASR(...)//注入ASR能力实现
      .enableTTS(...)//注入TTS能力实现
      .enableSegmentation(...)//注入图片分割能力实现
  ```

### 3. 原子能力调用(客户端)

#### 3.1 ASR能力

> 多模型SDK默认提供火山模型的ASR能力，也支持开发者注入自定义的ASR能力, 两者二选一。

- 初始化

  ```kotlin
  //创建ASRConfig
  val asrConfig = ASRConfig(
     url = "${asrServiceUrl}", //asr服务地址
     appKeyFetcher = {
        //返回对应的appKey, 开发者自行申请
     },   
     sampleRate = 24000, //采样率
     tokenFetcher = {
        //返回对应的token，开发者自行申请
     }
  ) 
  
  //火山模型提供的asr能力
  MultimodalKit.enableASR(AsrServiceWithVolcengine(), asrConfig) 
  
  
  //开发者注入自定义的ASR能力
  val asrService = object: IAsrService{
      override suspend fun start(
          context: Context, 
          asrConfig: ASRConfig, //ASR配置
          recorder: IRecorder,  //录音实现
          audioConsumer: IAudioConsumer?, //处理音频数据
          eosSilenceTimeout: Int?, //eos超时时间 
          sosSilenceTimeout: Int?  //sos超时时间
      ) { 
          //开始监听语音
      }
      
      override fun release() {
          //ASR服务结束时相关逻辑
      }
  
      override fun registerAsrResultCallback(callback: ASRResultCallback) {
           //注册语音转文字结果回调
       }
  
      override fun unregisterAsrResultCallback() {
           //取消语音转文字结果回调
      }
  
      override fun isInit(): Boolean {
         //判断ASR服务是否开启
      }
  }
  
  MultimodalKit.enableASR(asrService, asrConfig)
  ```

- 调用ASR能力

> ASR的一次识别过程
> 开启ASR服务(onASRStart)->语音输入->语音识别(onReceiving)->结束语音输入->语音识别(onFinalResult)->结束ASR服务(onASRStop)

  ```kotlin
  //注册ASR结果回调
  val asrResultListener = object : ASRResultCallback {
      override fun onFinalResult(result: String) {
         //ASR识别结束回调，返回完整的语音识别结果
      }
  
      override fun onReceiving(totalText: String) {
         //ASR识别过程中回调，返回语音输入进程中的识别结果
      }
  
      override fun onError(errorCode: Int, errorMsg: String, taskId: String) {
         //ASR识别出错
      }
  
      override fun onASRStart(taskId: String) {
          //ASR服务开始回调
      }
  
      override fun onASRStop(taskId: String, sosTimeout: Boolean) {
          //ASR停止回调
      }
  }
  
  ASRManager.registerAsrResultCallback(asrResultListener)
  
  //启动ASR服务
  //可选参数
  val audioConsumer = object: IAudioConsumer {
     override fun fun consume(audioData: ByteArray, offset: Int, length: Int) {
        //音频数据回调，可用于展示音频数据对应的波形图
     }
  }
  
  ASRManager.start(
     AudioRecorder(), 
     audioConsumer, 
     1000, //eos超时时间 
     10000 //sos超时时间
  )
  
  //结束ASR服务
  ASRManager.unregisterAsrResultCallback(asrResultListener)
  ASRManager.release()
  ```

#### 3.2 TTS能力

> 多模型SDK默认提供火山模型的TTS能力，也支持开发者注入自定义的TTS能力, 两者二选一初始化

- 初始化

  ```kotlin
  //创建TTSConfig
  val ttsConfig = TTSConfig(
     url = "${ttsServiceUrl}", //tts服务地址
     appKeyFetcher = {
        //返回对应的appKey，开发者自行申请
     },
     sampleRate = 24000, //采样率
     foramt = "pcm",   //音频格式
     speechRate = 15,  //tts语音播放速度 
     tokenFetcher = {
        //返回对应的token，开发者自行申请
     }
  )
  
  //火山模型提供的tts能力
  MultimodalKit.enableTTS(VolcengineTTSServiceImpl(), ttsConfig) 
  
  //开发者注入自定义的TTS能力
  val ttsService = object: TTSService {
  
     override fun init(ttsConfig: TTSConfig){
        //初始化
     }
  
     override fun play(
        playText: String, //待播放的文字 
        speaker: String? = null, //音色
        //tts服务返回的音频数据生命周期回调，可用于实现将tts返回的音频数据保存在本地
        audioDataCallback: AudioDataCallback ?= null 
        ): Job {
        //播放指定文字
     }
  
     override fun playStreaming(
         playText: StreamingString, //流式输入
         speaker: String? = null, //音色
         //tts生命周期回调
         listener: TTSStatusChangeListener? = null, 
         //tts服务返回的音频数据生命周期回调，可用于实现将tts返回的音频数据保存在本地
         audioDataCallback: AudioDataCallback?= null
         ): Job {
         //播放流式输入文   
     }
  
     override fun stop(): Boolean {
        //停止tts服务，返回是否成功停止
     }
  }
  MultimodalKit.enableTTS(ttsService, ttsConfig)
  ```

- 调用TTS能力

  ```kotlin
  val listener = object: TTSStatusChangeListener {
  
     override fun onPlayStart(taskId:String) {
        //tts开始播放
     }
  
     override fun onPlayFinished() {
        //tts完成播放
     }
  
     override fun onPlayError(errorCode: Int, error: String, taskId: String){
        //tts播放出错
     }
  
     override fun onSentencePlayStart(text: String) {
        //tts开始播放
     }
  }
  
  //播放指定文本
  TTSService.getInstance().play(playText)
  
  //播放流式输入
  TTSService.getInstance().playStreaming(playText, listener)
  ```

#### 3.3 视觉大模型交互

> 多模型SDK默认提供和火山模型交互能力

- 初始化
  ```kotlin
  //初始化全局 VLMChat 实例
  val config = VLMArkConfig(
      endPoint = "", //节点信息，开发者自行申请
      host = "https://ark.cn-beijing.volces.com",  //大模型服务地址
      apiKey = "" //apiKey 开发者自行申请
  )
  
  MultimodalKit.initGlobalVLM(VLMArkService(), config)
  
  // VLMChat 创建 VLMChat 实例
  val vlmChat = VLMChatProvider.createArkVLMChat(config)
  ```

- 调用大模型能力

  ```kotlin
  //非流式
  val response = VLMChatProvider.globalVlmChat?.extension().send(
     systemPrompt = "",  //prompt
     input = "",         //查询内容,如果没有传空串
     bitmapList = listOf<VisualImageObject<*>>() //图片列表，如果没有图片，空List
   )
   
   //流式
   val response = VLMChatProvider.globalVlmChat?.extension().sendStreaming(
     systemPrompt = "",  //prompt
     input = "",         //查询内容,如果没有传空串
     bitmapList = listOf<VisualImageObject<*>>() //图片列表，如果没有图片，空List
   )
   
   response.onStreamingString(object: StreamingStringCallback {
       override fun callback(totalText: String, newText: String, isFinish: Boolean) {
           if (isFinish) {
              //流式响应完成，totalText代表整体的响应
           } else {
               //流式响应进行中
           }
       }
   }) 
   ```

- 提供tools供VLM调用
  - 方式一：ToolFunction注入方式

  ```kotlin
   // tools
   val toolCalls = listOf(
          ToolCall(function = ToolFunction(name = "function1", description = "这是个测试方法1", 
                     ToolFunction.Input(properties = "{jsonSchema}", required = listOf("arg1")))),
          ToolCall(function = ToolFunction(name = "function2", description = "这是个测试方法2",
                     ToolFunction.Input(properties = "{jsonSchema}"，required = listOf("arg1")))),
          ToolCall(function = ToolFunction(name = "function3", description = "这是个测试方法3",
                     ToolFunction.Input(properties = "{jsonSchema}")，required = listOf("arg1"))),
      )
      
  // Input 中properties以 JSON Schema 格式描述。具体格式请参考 jsonSchema,示例如下 
   {
      "参数名": {
        "type": "string | number | boolean | object | array",
        "description": "参数说明"
      }
   }
   
   val response = VLMChatProvider.globalVlmChat?.extension().sendStreaming(
     systemPrompt = "",  //prompt
     input = "",         //查询内容,如果没有传空串
     bitmapList = listOf<VisualImageObject<*>>()， //图片列表，如果没有图片，空List
     tools = toolCalls
   )
   
   response.onFunctionCall(object :FunctionCallCallback(){
      override fun onFunctionCall(name: String, arguments: String) {
          //name 对应
          //arguments 是 json 格式，需自行解析入参
      }
  })
  ```

  - 方式二：注解注入方式

  ```kotlin
  class CustomTools : AITool {
  
      @AIToolFunction(
          name = "function1", 
          description = "这是个测试方法1", 
          runMain = true
      )
      fun function1(
          @AIToolParam(description = "入参 1", required = true) arg1: String,
          @AIToolParam(description = "入参 2", required = true) arg2: Int
      ) {}
  
      @AIToolFunction(
          name = "function2", 
          description = "这是个测试方法2", 
          runMain = true
      )
      fun function2(
          @AIToolParam(description = "入参 1", required = true) arg1: String,
          @AIToolParam(description = "入参 2", required = true) arg2: Int
      ) {}
  }
  
  // 会自动反射调用调用对应的 funcation，无需走onFunctionCall回调
   val response = VLMChatProvider.globalVlmChat?.extension().sendStreaming(
     systemPrompt = "",  //prompt
     input = "",         //查询内容,如果没有传空串
     bitmapList = listOf<VisualImageObject<*>>()， //图片列表，如果没有图片，空List
     tools = listOf(CustomTools(),...) // 提供 AITool 的实现类，方法示例如上
   )
   
   //提供 VLMChat 级别的 Tools，每次使用对应的 VLMChat调用大模型都会带上对应的 Tools
   val vlmChat = VLMChatProvider.createArkVLMChat(config: VLMArkConfig)
   vlmChat.aiToolContext.registerAITool(CustomTools())
  ```

#### 3.4 图片物体识别能力

> 多模型SDK默认使用RT-DETR模型进行物体识别，也支持开发者注入自定义的物体识别能力, 两者二选一
> 本地模型文件由开发者自己提供，多模态SDK目前仅支持onnx格式加载

- 初始化

  ```kotlin
  //初始化ModelDownloader
  //参见 初始化多模态SDK
  
  //初始化物体识别能力
  MultimodalKit.enableObjectDetector(
     RtdetrDetectorServiceImpl(
          modelPath = "xxx.onnx", //RT-DETR模型文件
          lableListPath = "coco_labels.dat" //模型训练集物体分类列表
     ))
     
     
   //开发者注入自定义的物体识别能力
   class CustomObjectDetector: IObjectDetector {
       override suspend fun detect(frame: Bitmap): List<BoundingBox> {
          //物体识别
       }
       
       override fun close() {
          //释放资源
       }
   } 
   
   class CustomObjectDetectorService: IObjectDetectService {
       override fun getObjectDetector(): IObjectDetector {
          return CustomObjectDetector()
       }
   }
   MultimodalKit.enableObjectDetector(CustomObjectDetectorService())
  ```

- 调用物体识别能力

  ```kotlin
  //获取objectDetector
  val objectDetector = ObjectDetectorManager.obtainObjectDetector()
  
  
  // 传入图片，获取识别结果, 类型为 List<BoundingBox>
  val results = objectDetector.detect(bitmap)
  //将识别结果中的相对坐标转换为绝对坐标
  results.foreach { result->
     val left = result.x1 * bitmap.width   //识别结果在图片中的left坐标
     val top = result.y1 * bitmap.height   //识别结果在图片中的top坐标
     val right = result.x2 * bitmap.width  //识别结果在图片中的right坐标
     val bottom = result.y2 * bitmap.height //识别结果在图片中的bottom坐标
     val label = result.clsName             //识别结果对应的分类名
  }
  
  //释放资源
  objectDetector.stop()
  ```

#### 3.5 图片分割能力

> 多模型SDK默认使用MobileSam模型进行图片分割，也支持开发者注入自定义的图片分割能力, 两者二选一

- 初始化

初始化ModelDownloader参见 **实始化IModelDownloader实现** 一节

  ```kotlin
  //完成初始化ModelDownloader
  
  //初始化物体识别能力
  MultimodalKit.enableSegmentation(
     MobileSamServiceImpl(
          encoderModelName = "xxx.onnx", //Encoder模型文件
          decoderModelName = "xxx.onnx" //Decoder模型文件
     ))
     
     
   //开发者注入自定义的物体识别能力
   class CustomPredictor: ISamPredictor {
       override suspend fun detect(frame: Bitmap): List<BoundingBox> {
          //物体识别
       }
       
       override fun close() {
          //释放资源
       }
   } 
   
   class CustomObjectDetectorService: IObjectDetectService {
       override fun getObjectDetector(): IObjectDetector {
          return CustomObjectDetector()
       }
   }
   MultimodalKit.enableObjectDetector(CustomObjectDetectorService())
  ```

- 调用图片分割能力

> 输入用户点击或者选择的区域，获取物体的 Segment 分割信息。可以结合画板，实现物体的圈选和点选逻辑。

  ```kotlin
  val samPredictor = ISegmentationService.getInstance().createSamPredictor()
  //设置要处理的图片
  samPredictor.setImageFromPath(bitmap)
  //指定焦点：可以是点选的二维坐标点，也可以是指定圈选的坐标集合, 两者二选一
  //点选
  val constraints: MutableList<SamConstraint> = mutableListOf(Point(
       x = 1, // 相对于图片左上角的X坐标(px)
       y = 1, // 相对于图片左上角的Y坐标(px)
       lable: 0  // 0 表示排除点 (exclude), 1 表示包含点 (include), 默认为 1
  ))
  //圈选
  val constrleftaints: MutableList<SamConstraint> = mutableListOf(Rectangle(
       left = 1.0,   // 矩形左边界坐标
       top = 1.0,    // 矩形上边界坐标
       right = 2.0,  // 矩形右边界坐标
       bottom = 2.0  // 矩形下边界坐标
  ))
  //图片分割
  val result = samPredictor.predict(constraints)
  var mask = result.masks.first()
  //二值化
  mask = OpenCvUtils.threshold(mask, 0.0)
  //图片分割结果转换为图片的坐标点
  val wrapper: MatOfPointWrapper = OpenCvUtils.maskToContour(
       bitmap.width, 
       bitmap.height,
       mask, 
       contourTopN ?: 3 // 可选，获取面积前 N 大的闭合轮廓，用于过滤杂乱小轮廓
  )
  
  
  class MatOfPointWrapper(
      val originWidth: Int,
      val originHeight: Int,
      // 三维数组，表示分割出的物体轮廓点列表 (格式为 [[ [y1, x1], [y2, x2], ... ], ...])，可直接用于绘制轮廓
      var matOfPoints: Array<IntArray>,  
      val segId: String  // 当前分割物体的唯一ID
    }
  )
  ```

#### 3.6 Realtime Converation 能力

> Realtime Converation 是多模型 SDK 结合 ASR，TTS，VLM等相关原子能力，在客户端完成ASR、TTS、VLM三者的调度，实现近实时的音视频对话交互。
- 初始化

多模态SDK提供默认的IVideoSource实现类FrameInterceptDelegate, 支持对图片的管理和过滤，开发者可以实现自己的IVideoSource实现类, 提供不同的图片来源。

  ```kotlin
  //创建AsrProcessor
  val systemPromptFetcher = suspend {
     //返回Prompt
  }
  
  //可选，如果实时对话需要将图片发送VLM。以下为自定义实现IVideoSource, 获取图片。
  val videoSource =  object: IVideoSource {
      override fun getFrameFlow(triggeredByCaller: Boolean): Flow<VisualImageObject<*>?> {
          //实现生成图片的逻辑
          if (triggerByCaller) {
             //AsrProcesssor内部主动获取图片, 一轮对话调用一次 
          } else {
             //AsrProcesssor订阅以后，主动往AsrProcessor发送图片
          }
      }
      
      override fun stop() {
         //停止输送图片
      }
  }
  
  /**
     指定对于Asr识别结果的处理链路，多模块SDKr提供默认实现，也支持业务方扩展自己的处理链路
      **/
  val asrResultProcessor = RealtimeServiceProvider.createDefaultAsrProcessor(
      config = DefaultProcessorConfig(systemPromptFetcher),
      videoSource = videoSource
  )
  
  //创建RealtimeSpeakerConfig
  /** 
      指定监听语音输入的配置：
      autoReconnect： sos超时断连，是否重连
      enableEos: 是否开启sos超时断连
      eosTimeout: 指定eos超时时间
  **/
  val realtimeSpeakerConfig = RealtimeSpeaker.RealtimeSpeakerConfig(
      autoReconnect = true,
      enableEos = true,
      eosTimeout = getEosTimeout()
  )
  
  //创建状态回调, 可选, 让调用方感知实时通话不同子阶段的变化，进行对应的业务处理
  val listener = object: StateListener {
      /**
      初始化成功回调, 新增
      **/
      override fun onInitSuccess() {}
      
      /**
        RealtimeServiceState状态变化通知
      **/
      override fun onStateChanged(newState: RealtimeServiceState)
  
      /**
      大模型回复 (流式)
      **/
      override fun llmResponse(string: StreamingString)
  
      /**
      asr识别结果（流式）
      **/
      override fun asrResponse(string: StreamingString)
  
      /**
      语音输入回调，用于生成说话时的波形图
      **/
      override fun onAudioInput(data: ByteArray)
  
  
      /**
      asr识别最终结果
      **/
      override fun onAsrResult(result: String) {}
  
      /**
      asr因为sos超时断连通知
      **/
      override fun onAsrStopWithSos() {}
  
      /**
      TTS每播放一句回调，用于实现字幕和tts同步
      **/
      override fun onSentencePlayStart(sentence: String) {}
   
      /**
      tts开始播放
      **/
      override fun onPlayStart(taskId: String) {}
  
      /**
      tts播放结束
      **/
      override fun onPlayCompleted(userInterrupted: Boolean) {}
      
      /**
      tts播放错误
      **/
      override fun onPlayError(errorCode: Int, errorMsg: String, taskId: String){}
      
      /**
      实时通话断连自动重连通知
      **/
      override fun onReconnect() {}
  }
  
  //创建LocalRealtimeServiceConfig
  val serviceConfig = LocalRealtimeServiceConfig(
      context = ..., //上下文
      videoSource = videoSource, //图片信息来源，调用方实现IVideoSource接口 
      recordSession = null,  // 用于调用方进行数据统计, 可选
      alwaysForeground = false,  // 是否需要启动ForegroundService保证应用切后台全局收音
      autoStartAsr = true, //创建RealtimeService以后，是否自动开启mic, 监听语音输入
      stateListener: StateListener = listener,  //状态回调
      asrResultProcessor = asrResultProcessor,
      realtimeSpeakerConfig = realtimeSpeakerConfig,
      /**
      是否支持多轮对话，默认支持
      **/
      val enableMultiConversation: Boolean = true
  )
  
  //创建RealtimeService
  val realtimeService: IRealtimeService = RealtimeServiceProvider.createRealtimeService(serviceConfig)
  ```

- 调用实时音视频对话

> 一轮实时对话的流程：
> 开始对话->开启ASR->语音输入->ASR识别结束->**从videoSource获取图片->将图片和ASR识别结果发送VLM->VLM回复**->TTS播放VLM回复

上述标记**加粗**的流程由SDK默认提供的DefaultAsrResultProcessor实现。开发者可以根据自己的业务需求，实现自定义AsrResultProcessor类，修改和VLM交互的流程

  ```kotlin
  //开始对话
  realtimeService.startMic()
  
  //关闭mic, 不再监听语音输入. 如果此时正在和VLM交互，或者播放TTS，不会中断这些操作    
  realtimeService.muteMic()    
      
  /***
   打断当前正在进行的一轮思考/tts输出
   stop对应 true: 不开启下一轮对话. false: 打断当前任务，开启下一轮对话
  ***/
  realtimeService.abortCurrentTask(stop: Boolean = false)
      
  //释放所有内存占用，RealtimeService不再可用。如果需要重新开启对话，需要重新创建新的realtimeService
  realtimeService.release(context: Context)
     
  /**
    获取realtimeService当前的状态
    sealed class RealtimeServiceState () {
      object NotStarted: RealtimeServiceState() //未建连
      object Starting: RealtimeServilokjx tfred ceState()   //正在建连
      object Idle: RealtimeServiceState()       //建连成功，未开始监听语音输入
      object Listening: RealtimeServiceState()  //开始监听语音输入
      object Talking: RealtimeServiceState()    //TTS播放语音
      object Handling: RealtimeServiceState()   //VLM/LLM正在处理
      //连接出错
      data class Error(val errorCode: Int, val errorMessage: String): RealtimeServiceState()
    }  
  **/
  val currentState = realtimeService.getCurrentState()
  
  //开发者不通过asr, 直接将文本发送给VLM
  realtimeService.sendTextQuery(query)
      
  //开发者主动调用tts播放指定文本
  realtimeService.splayTTS(text)
  ```

- 自定义AsrProcessor

> 继承抽象类 AsrResultProcessor

  ```kotlin
  abstract class AsrResultProcessor(
      protected val videoSource: IVideoSource?,
  ) {
  
      private val interceptorList: MutableList<Interceptor> = mutableListOf()
      private var resultCallback: ResultCallback? = null
  
      fun processAsrResult(totalText: String) {
          for(interceptor in interceptorList) {
              if (interceptor.intercept(totalText)){
                  return
              }
          }
          processAsrResultInternal(totalText)
      }
  
      protected abstract fun processAsrResultInternal(totalText: String)
  
      //停止当前任务
      abstract fun abortCurrentTask()
  
      /***
         初始化 Processor。
         子类如果有自己的初始化逻辑可以重写init方法。
         true: 初始化成功
         false: 初始化失败。如果返回失败，会导致LocalRealtimeService初始化失败
      ***/
      open suspend fun init(): Boolean {
           return true
      }
      
      /**
      注入拦截器，在将asr识别结果提交给VLM之前注入对应的业务逻辑，可以拦截将asr识别结果提交给VLM
      **/
      fun addInterceptor(interceptor: Interceptor) {
          interceptorList.add(interceptor)
      }
  
      /***
         子类通过此方法，获取对应的callback, 将processor对ASR的处理结果传递给调用方
      ***/
      protected fun getResultCallback(): ResultCallback? = resultCallback
   
      /**
      设置VLM处理结果回调
      **/
      fun setResultCallback(resultCallback: ResultCallback?) {
          this.resultCallback = resultCallback
      }
  
      //释放资源
      open fun release() {
          resultCallback = null
          interceptorList.clear()
          videoSource?.stop()
      }
      
      //拦截器定义
      interface Interceptor {
          fun intercept(totalText: String): Boolean
      }
  
      interface ResultCallback {
          fun onVLMResultReceived(response: LLMResult)
          fun onVLMResultStreamingReceived(response: StreamingString, questionId: String?)
          fun onVLMResultError(errorCode: String, errorMsg: String?)
      }
  }
  
  
  class CustomAsrResultProcessor(
     videoSource: IVideoSource
  ): AsrResultProcessor (videoSource) {
  
     override fun processAsrResultInternal(totalText: String) {
        //收到ASR识别结果，处理ASR识别结果
     }
  
      override fun abortCurrentTask() {
         //取消当前的处理流程
      }
  
      override fun release() {
          super.release()
          //释放资源 
       }
  }
  ```

### 4. 原子能力调用（前端）
#### 4.1 启用JSB能力

  ```kotlin
  // 创建 Bridge 环境
  val aiBridge = AIBridge()
  
  // 给 WebView 注入接口
  val webView = Webview(context)
  val port = WebViewBridgePort.create(webView)
  aiBridge.start(port)
  
  // 注入 Bridge 能力 ，只对单个AIBridge有效
  aiBridge.register(OpenCameraMethod::class.java)
  aiBridge.register(GetImageInfoMethod::class.java)
  aiBridge.register(GetObjectDetectionMethod::class.java)
  aiBridge.register(GetSAMInfoMethod::class.java)
  
  // 注入 Bridge 能力 ，对所有 AIBridge 有效
  GlobalMethodSeeker.register(MultiModalStartTTSMethod::class.java)
  GlobalMethodSeeker.register(MultiModalCancelTTSMethod::class.java)
  GlobalMethodSeeker.register(MultiModalStartASRMethod::class.java)
  GlobalMethodSeeker.register(MultiModalStopASRMethod::class.java)
  GlobalMethodSeeker.register(MultiModalCreateStreamingTTSMethod::class.java)
  GlobalMethodSeeker.register(MultiModalAppendStreamingTTSMethod::class.java)
  GlobalMethodSeeker.register(MultiModalCancelStreamingTTSMethod::class.java)
  
  GlobalMethodSeeker.register(ChatCompletionMethod::class.java)
  GlobalMethodSeeker.register(CancelChatCompletionStreamingMethod::class.java)
  GlobalMethodSeeker.register(RequestChatCompletionStreamingMethod::class.java)
  GlobalMethodSeeker.register(ReadChatCompletionStreamingMethod::class.java)
  ```

#### 4.2 JSB能力列表

请参阅`frontend`文件夹下的[README文档](../frontend/README.md)

## SDK包大小

### AAR

| AAR 文件 | 大小 |
| :--- | :--- |
| `multimodalkit-common-tob` | 93kb |
| `multimodalkit-algorithm-api-tob` | 11kb |
| `multimodalkit-algorithm-opencv-tob` | 11kb |
| `multimodalkit-asr-api-tob` | 35kb |
| `multimodalkit-asr-bridge-tob` | 11kb |
| `multimodalkit-asr-volcano-tob` | 21kb |
| `multimodalkit-inference-onnx-tob` | 5kb |
| `multimodalkit-object-detect-api-tob` | 9kb |
| `multimodalkit-object-detect-rtdetr-tob` | 16kb |
| `multimodalkit-segmentation-api-tob` | 10kb |
| `multimodalkit-segmentation-common-tob` | 20kb |
| `multimodalkit-segmentation-mobilesam-tob` | 19kb |
| `multimodalkit-tts-api-tob` | 27kb |
| `multimodalkit-tts-bridge-tob` | 24kb |
| `multimodalkit-tts-volcano-tob` | 21kb |
| `multimodalkit-visual-bridge-tob` | 22kb |
| `multimodalkit-visual-image-tob` | 67kb |
| `multimodalkit-visual-realtime-api-tob` | 51kb |
| `multimodalkit-visual-realtime-local-tob` | 102kb |
| `multimodalkit-vlm-api-tob` | 107kb |
| `multimodalkit-vlm-ark-tob` | 42kb |
| `multimodalkit-vlm-bridge-tob` | 23kb |
| `multimodalkit-web-bridge-tob` | 15kb |

### 模型文件和其他

| 文件 | 大小 |
| :--- | :--- |
| `mobile_sam_decoder.onnx` | 16.5MB |
| `mobile_sam_encoder.onnx` | 28.1MB |
| `rt-detr_v2_s.onnx` | 80.5MB |
| `coco_labels.dat` | 620 B |

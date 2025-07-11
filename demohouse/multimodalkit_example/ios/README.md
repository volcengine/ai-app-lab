# Multimodal-kit iOS

## 运行示例工程

### 1. 环境准备

若体验ASR/TTS/VLM等能力，请参阅 [TokenFetcher](demohouse/multimodalkit_example/ios/Modules/ExampleBusiness/ExampleBusiness/Classes/MultiModal/TokenFetcher.swift) 完成相关火山能力 Token 配置。

若体验端侧能力，需分别下载物体分割([MobileSAM](https://github.com/ChaoningZhang/MobileSAM))/物体识别([RT-DETR](https://github.com/lyuwenyu/RT-DETR))模型文件压缩文件，并 **解压后** 放置在iOS工程 [`Modules/ExampleBusiness/ExampleBusiness/Assets`](Modules/ExampleBusiness/ExampleBusiness/Assets) 目录下，使用对应模型文件时需遵守其许可证要求。
模型文件如下：
- [mobilesam_decoder.mlmodelc.zip](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/mobilesam_decoder.mlmodelc.zip)
- [mobilesam_encoder.mlmodelc.zip](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/mobilesam_encoder.mlmodelc.zip)
- [rtdetrv2_s_vision_2.mlmodelc.zip](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/rtdetrv2_s_vision_2.mlmodelc.zip)

## 接入多模态SDK

### 1. 接入说明

- 支持 Xcode 16+/iOS 13+/Swift 5.1+。
- 使用 cocoapods 接入:
```
source 'https://github.com/volcengine/volcengine-specs.git'
pod 'MultiModalKitToB', '~> 1.0.0'
```

### 2. SDK初始化

- 本SDK初始化不会获取个人信息。**请务必在用户同意您App中的隐私政策后,再进行本SDK的初始化。**

- 请参考工程中的[MultiModalManager](demohouse/multimodalkit_example/ios/Modules/ExampleBusiness/ExampleBusiness/Classes/MultiModal/MultiModalManager.swift)的setup函数完成初始化。


- 初始化 SDK 基本配置
```
let config = MultiModalKitConfig(
    appId: "",           // app 标识，由接入方自行决定，不影响SDK使用
    deviceId: "",        // 设备标识，由接入方自行决定，不影响SDK使用
    env: .online,        // 环境，固定使用 .online
    asrType: .bigASR,    // asr实现，固定使用 .bigASR
    ttsType: .speech     // tts实现，固定使用 .speech
)
AIMultiModalManager.shared.setup(config: config)
```

- 按需注入日志、track 能力实现，举例如下：
```
class MultiModalManager  {    
    static let shared = MultiModalManager()
    
    func setup() {
        AIMultiModalManager.shared.trackDelegate = self
        AIMultiModalManager.shared.logDelegate = self
    }
}
```

- 对于上述MultiModalManager，实现日志能力：
```
extension MultiModalManager: AIMultiModelLogDelegate {    
    func logInfo(message: String, file: String, function: String, line: Int) {
        // 可打印出 Info 日志
    }
    
    func logError(message: String, file: String, function: String, line: Int) {
        // 可打印出 Error 日志
    }
}
```

- 对上述MultiModalManager，实现 track 能力：
```
extension MultiModalManager: AIMultiModelTrackDelegate {
    func track(event: String, params: [String : Any]?) {
        // 可自行上报管理 track 事件   
    }
}
```

### 3. 原子能力调用(客户端)

#### 3.1 语音能力调用

##### 3.1.1 前置流程

- 多模态SDK基于火山语音SDK，提供轻便的ASR/TTS能力接口。在使用语音能力之前，请先行注册火山语音能力，同时需要实现 AIMultiModalAuthConfigDelegate 并注入到 AIMultiModalManager 中。
```
AIMultiModalManager.shared.authConfigDelegate = MultiModalManager.shared()

extension MultiModalManager: AIMultiModalAuthConfigDelegate {
    
    func speechASRAuthConfig() -> AIMSpeechAuthConfig? {
        let config = AIMSpeechAuthConfig(
            address: "wss://openspeech.bytedance.com",
            uri: "/api/v3/sauc/bigmodel",
            resourceId: "volc.bigasr.sauc.duration",
            appId: "",    // 火山 ASR 服务注册的 appId
            token: ""     // 火山 ASR 服务注册的 tokne
        )
        return config
    }
    
    func speechTTSAuthConfig() -> AIMSpeechAuthConfig? {
        let config = AIMSpeechAuthConfig(
            address: "wss://openspeech.bytedance.com",
            uri: "/api/v1/tts/ws_binary",
            resourceId: "volcano_tts",
            appId: "",    // 火山 TTS 服务注册的 appId
            token: ""     // 火山 TTS 服务注册的 tokne
        )
        return config
    }
}
```

##### 3.1.2 ASR能力

- 如需使用 ASR 能力，请先完善 Xcode 工程的 NSMicrophoneUsageDescription 配置以实现录音权限。

- 启用 ASR 识别：
```
AIMASRManager.shared.start { success, errorMsg in
    if !success {
        NSLog("asr start failed \(errorMsg)")
    }
} event: { msg, finished in
    NSLog("asr result \(msg) is finished \(finished)")
} statusCallback: { status, errorMsg in
    NSLog("asr status update: \(status), error: \(errorMsg)")
}
```

- 停止 ASR 识别：
```
AIMASRManager.shared.stop()
```

##### 3.1.3 TTS能力

- AIMTTSSessionDelegate 说明

```
public protocol AIMTTSSessionDelegate: AnyObject {
    // tts 状态回调
    func ttsSession(_ session: AIMTTSSessionService, statusDidChanged status: AIMTTSSessionStatus, errorMsg: String?)
    // tts 转换的音频数据回调
    func ttsSession(_ session: AIMTTSSessionService, didReceiveAudioData: Data)
}
```

- 启用单句非流式 TTS 能力。单句非流式 TTS 在初始化时传入所有需要语音转换的文字，无法在转换的过程中动态增加额外需要转换的文字：

```
// 初始化 TTS 转换配置
let ttsConfig = AIMTTSConfig(
    speaker: "zh_female_kailangjiejie_moon_bigtts",    // 火山 tts 音色
    ttsFormat: "pcm",        // 音频数据格式，固定传入 pcm
    ttsSampleRate: 24000,    // 音频采样率
    speechRate: 15           // 语速
)

// 启用单句 TTS，如果成功，会返回 sessionId 并开始转换，sessionId 可用于提前取消本次转换任务。
let sessionId = AIMTTSManager.shared.createSession(
    config: ttsConfig,     // tts 配置
    delegate: nil,         // tts 回调，请参看 AIMTTSSessionDelegate 说明
    text: "今天天气怎么样"    // tts 转换文字
)

// 取消 tts 转换
AIMTTSManager.shared.cancelSession(sessionId: sessionId)
```

- 启用流式 TTS 能力。流式 TTS 在初始化时不传入文字，而是使用 append 接口按需传入：

```
// 初始化 TTS 转换配置
let ttsConfig = AIMTTSConfig(
    speaker: "zh_female_kailangjiejie_moon_bigtts",    // 火山 tts 音色
    ttsFormat: "pcm",        // 音频数据格式，固定传入 pcm
    ttsSampleRate: 24000,    // 音频采样率
    speechRate: 15           // 语速
)

// 启用TTS，如果成功，会返回 sessionId 并开始转换，sessionId 可用于提前取消本次转换任务。
let sessionId = AIMTTSManager.shared.createSession(
    config: ttsConfig,     // tts 配置
    delegate: nil         // tts 回调，请参看 AIMTTSSessionDelegate 说明
)

// 传入需要转换的文字
let success = AIMTTSManager.shared.appendText(
    sessionId: sessionId, 
    text: "你今天",         // 本次需要转换的文字
    isFinish: false        // 是否 append 结束
)

let success = AIMTTSManager.shared.appendText(
    sessionId: sessionId, 
    text: "过的怎么样",       // 本次需要转换的文字
    isFinish:  true         // 是否 append 结束
)

// 取消 tts 转换
AIMTTSManager.shared.cancelSession(sessionId: sessionId)
```

#### 3.2 视觉大模型交互
- 多模型SDK提供和火山模型交互的能力。在使用前，请接入方先行注册火山大模型能力，并获取相应 token 参数用于后续注入。

- 初始化
```
//初始化全局 VLMChat 实例
let vlmGlobalConfig: AIMVLMModelConfig = .init(
    model: String, // 模型名称
    token: String, // token
    tools: [any AIMVLMTool]? = nil // 大模型所需要的 tools
)
AIMVLMProvider.shared.setupGlobalConfig(vlmGlobalConfig)

// VLMChat 创建 VLMChat 实例
let vlmChat = AIMVLMProvider.createVolcVLM(config: vlmGlobalConfig)
```

- 调用大模型能力
```
let vlmChat = AIMVLMProvider.createVolcVLM(config: vlmGlobalConfig)

// 非流式
vlmChat.send(
    prompt: String?,  // system prompt
    messages: [VLMEntryMessage],  // 发送给模型的消息内容
    completion: @escaping (Response) -> Void  // 回调
)

let response = await vlmChat.send(
    prompt: String?,  // system prompt
    messages: [VLMEntryMessage],  // 发送给模型的消息内容
)

// 流式
vlmChat.sendStream(
    prompt: String?,  // system prompt
    messages: [VLMEntryMessage],  // 发送给模型的消息内容
    completion: @escaping (Response) -> Void  // 回调
)
```

- 提供tools供VLM调用

```
 // tools 定义
 public protocol AIMVLMTool {
    // 预期的模型返回参数类
    associatedtype T: Codable
    
    // tools的描述，参数的描述
    var description: AIMVLMToolDescription { get }
    
    // 模型回复的参数转换成 T 失败时，调用该方法
    func onParamsConvertFailed(params: String)
    
    // 模型回复的参数转换成 T 成功时，调用该方法
    func call(params: T)
}

let vlmGlobalConfig: AIMVLMModelConfig = .init(
    model: "", // 模型名称
    token: "", // token
    tools: [ToolA, ToolB] // 大模型所需要的 tools
)

let vlmChat = AIMVLMProvider.createVolcVLM(config: vlmGlobalConfig)

// 收到回复后，如果回复中包含 tools_call,则会自动调用对应的 tools
vlmChat.send(
    prompt: String?,  // system prompt
    messages: [VLMEntryMessage],  // 发送给模型的消息内容
    completion: @escaping (Response) -> Void  // 回调
)
```

#### 3.3 图片物体识别能力
- 使用端侧算法模型对图片的进行物体识别操作。
- 模型接入
  - 请将多模态 SDK 提供的物体识别模型 rtdetrv2_s_vision_2.mlmodelc 配置在业务工程的合适位置。
  - 注入AIMMLModelLoadService的实现：

```
import Foundation
import MultiModalKitToB

// 实现 AIMMLModelLoadService，必须继承 NSObject
class ModelLoader: NSObject, AIMMLModelLoadService {
    func loadModel(info: AIMMLModelInfo, callback: @escaping (String?) -> Void) {
        // 根据 info 参数，获取对应模型的路径位置，并返回
        let path = ""
        callback(path)
    }
    
    static func makeService() -> AIMServiceProtocol {
        return ModelLoader()
    }
}

// 在启动多模态 SDK 时注入实现
AIMServiceManager.shared.register(clsName: "ModelLoader", service: AIMMLModelLoadService.self)
```

- 接口说明
  - 入参：主要是通过 CVPixelBuffer 进行识别和分析，以下参数二选一
    - image（UIImage）
    - buffer（CVPixelBuffer）
  - 返回参数：
    - 返回一个物体坐标数组 （[AIMImageDetectInfo]）
```
/// 识别检测信息，参数为实际像素值
public struct AIMImageDetectInfo: Codable, CustomStringConvertible {
    public var centerX = 0.0
    public var centerY = 0.0
    public var width = 0.0
    public var height = 0.0
    public var name: String = ""
    public var confidence: Float = 0.0
    
    public var x1: Double { centerX - width / 2 }
    public var x2: Double { centerX + width / 2 }
    public var y1: Double { centerY - height / 2 }
    public var y2: Double { centerY + height / 2 }
    public var area: Double { width * height }
    
    public var description: String {
        "DetectInfo(name: \(name), cx: \(centerX), cy: \(centerY), width: \(width), height: \(height))"
    }
}
```

- 调用方式

```
/* params
image: Image
buffer: CVPixelBuffer
return (Error?, [AIMImageDetectInfo]?) */
detectService.detect(image: UIImage(), buffer: info.buffer) { error, result in
    if let error {
      showToast(message: "物体识别错误")
    }
    guard let result else {
      showToast(message: "物体识别错误")
    }
    Log.info("detect count \(result.count) result \(result)")
}
```

#### 3.4 图片分割能力
- 使用端侧算法模型对图片的进行物体分割操作。
- 模型接入
  - 请将多模态 SDK 提供的物体分割模型 mobilesam_decoder.mlmodelc、mobilesam_encoder.mlmodelc 配置在业务工程的合适位置。
  - 注入AIMMLModelLoadService的实现：

```
import Foundation
import MultiModalKitToB

// 实现 AIMMLModelLoadService，必须继承 NSObject
class ModelLoader: NSObject, AIMMLModelLoadService {
    func loadModel(info: AIMMLModelInfo, callback: @escaping (String?) -> Void) {
        // 根据 info 参数，获取对应模型的路径位置，并返回
        let path = ""
        callback(path)
    }
    
    static func makeService() -> AIMServiceProtocol {
        return ModelLoader()
    }
}

// 在启动多模态 SDK 时注入实现
AIMServiceManager.shared.register(clsName: "ModelLoader", service: AIMMLModelLoadService.self)
```

- 图像分割主要是通过根据输入的图像信息，提供一个图片 CVPixelBuffer 信息:

```
public struct AIMSegmentPoint: CustomStringConvertible {
    public let x: Float
    public let y: Float
    public let label: Int
    
    public init(x: Float, y: Float, label: Int) {
        self.x = x
        self.y = y
        self.label = label
    }
    
    public var description: String {
        "SegPoint(x: \(x), y: \(y), label: \(label))"
    }
}
```

- 调用方式

```
/*
params:
sessionId: String value, for identify predict process
buffer: image CVPixelBuffer
points: 
return: MTLTexture
*/

AIMService<AIObjectSegmentService>.get()?
            .predict(sessionId: sessionId, buffer: image.buffer, points: points) { texture in
   // handle texture, to show the object segment info    
}

/* --------------- or  ----------------- */

let session = AIMSegmentSession(sessionId:sessionId, buffer: buffer)
AIMSegmentProcessor.shared.encode(session: session)
AIMSegmentProcessor.shared.predict(points: points) { texture in
  // handle texture, to show the object segment info 
}
```

#### 3.5 Realtime Conversation 能力

- 多模型SDK结合ASR, TTS, VLM等相关原子能力，在客户端完成能力调度，实现实时音视频对话的交互
- 在使用大模型实时通话能力之前，请按照语音能力使用一节，注册火山 ASR/TTS 语音能力，并成功注入实现AIMultiModalAuthConfigDelegate。
- 多模态SDK提供默认的AIMVideoSourceProtocol实现类FrameInterceptDelegate, 支持对图片的管理和过滤，开发者可以实现自己的AIMVideoSourceProtocol实现类, 提供不同的图片来源。
- 初始化实时通话 session 对象：

```
// 初始化 AIMRealtimeSessionConfig
let audioConfig = AIMRealtimeAudioConfig(vadDuration: 1000, ttsSpeakerType: "zh_female_kailangjiejie_moon_bigtts")
let videoSourceConfig = AIMDefaultVideoSourceConfig(
    frameInterval: 1000.0,
    frameLength: 720,
    enableFpCompute: true,
    fpMinDistance: 0.25
)
let videoSource = AIMDefaultVideoSource(config: videoSourceConfig)
let asrProcessor = AIMDefaultASRResultProcessor(
    prompt: "你是一个具备图片理解能力的智能助手", 
    businessId: UUID().uuidString, 
    videoSource: videoSource
)
let config = AIMRealtimeSessionLocalConfig(delegate: self, audioConfig: audioConfig, asrProcessor: asrProcessor)

// 获取实时对话 session
let realtimeSession = AIMRealtimeManager.shared.createSession(config: config)
```

- session 接口说明：

```
public protocol AIMRealtimeSessionProtocol: AnyObject {
    
    // session唯一id
    var sessionId: String { get }
    
    // session状态
    var status: AIMRealtimeSessionStatus { get }
    
    // 启用语音输入
    func startMic()
    
    // 停止语音输入
    func muteMic()
    
    // 打断当前正在进行的一轮思考/tts输出
    func abortCurrentTask()
    
    // 输入文字来发起一次query
    func sendTextQuery(_ text: String)
    
    // 释放所有内存占用，不再可用
    func close()
}
```

- AIMRealtimeSessionDelegate 回调说明：

```
public protocol AIMRealtimeSessionDelegate: AnyObject {
    // 状态回调
    func session(_ session: AIMRealtimeSessionProtocol, didChangeStatus status: AIMRealtimeSessionStatus)
    
    // 消息更新
    func session(_ session: AIMRealtimeSessionProtocol, updateMessage message: AIMRealtimeMessage)
    
    // 每次捕获画面帧时回调
    func sessionDidReceiveNewFrame(_ session: AIMRealtimeSessionProtocol)
}
```

### 4. 原子能力调用（前端）

#### 4.1 启用JSB能力

- 在创建 WKWebView 的时候，请参考 [BridgeTestViewController](demohouse/multimodalkit_example/ios/Modules/ExampleBusiness/ExampleBusiness/Classes/MainUI/BridgeTestViewController.swift) 的 setupWebView() 函数注入 Bridge 框架。

```swift
let bridge = AIBridge(context: .init(appletId: "test", containerId: "test"))
let port = DefWebViewBridgePort.init(webviewDelegate: { [weak self] in self?.webView }, bridge: bridge)
let contentController = WKUserContentController()
let userScript = WKUserScript(source: DefWebViewBridgePort.bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
contentController.addUserScript(userScript)
contentController.addScriptMessageHandler(port, contentWorld: WKContentWorld.page, name: DefWebViewBridgePort.jsMessageHandlerObject())
            
let webConfiguration = WKWebViewConfiguration()
webConfiguration.userContentController = contentController
webView = WKWebView(frame: .zero, configuration: webConfiguration)
```

- 注入需要的能力：

```swift
// 对单个 AIBridge 有效
bridge.registerMethods([
    AIMultiModalStartTTSMethod(),
    AIMultiModalCancelTTSMethod()
])

// 对所有 AIBridge 有效
AIBridgeMethodManager.shared.register(method: AIMultiModalStartTTSMethod())
AIBridgeMethodManager.shared.register(method: AIMultiModalCancelTTSMethod())
AIBridgeMethodManager.shared.register(method: AIMultiModalCreateStreamingTTSMethod())
AIBridgeMethodManager.shared.register(method: AIMultiModalAppendStreamingTTSMethod())
AIBridgeMethodManager.shared.register(method: AIMultiModalCancelStreamingTTSMethod())
        
AIBridgeMethodManager.shared.register(method: AIMStartASRMethod())
AIBridgeMethodManager.shared.register(method: AIMStopASRMethod())
        
AIBridgeMethodManager.shared.register(method: AIMChatRequestMethod())
AIBridgeMethodManager.shared.register(method: AIMChatStreamRequestMethod())
AIBridgeMethodManager.shared.register(method: AIMChatStreamCancelMethod())
AIBridgeMethodManager.shared.register(method: AIMChatStreamReadMethod())
        
AIBridgeMethodManager.shared.register(method: AIMGetObjectDetectListMethod())
AIBridgeMethodManager.shared.register(method: AIMGetSAMInfoMethod())
AIBridgeMethodManager.shared.register(method: AIMGetImageInfoMethod())
```

#### 4.2 JSB能力列表

请参阅fe文件夹下的[README文档](../fe/API.md)

## SDK包大小

- MultiModalKitToB：752KB

- 依赖库：

| 依赖库 | 大小 |
| :--- | :--- |
| `Mantle` | 53.9KB |
| `OpenCV2` | 1.35MB |
| `TTNetworkManager` | 5.36MB |
| `SpeechEngineToB` | 1.7MB |

- 端侧模型文件：

| 模型 | 大小 |
| :--- | :--- |
| `mobilesam_decoder.mlmodelc` | 12.4MB |
| `mobilesam_encoder.mlmodelc` | 14.1MB |
| `rtdetrv2_s_vision_2.mlmodelc` | 40.4MB |
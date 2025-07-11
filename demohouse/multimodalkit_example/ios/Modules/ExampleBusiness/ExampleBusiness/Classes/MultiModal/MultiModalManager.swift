//
//  MultiModalManager.swift
//  ExampleBusiness
//
//  Created by ByteDance on 2025/5/15.
//

import Foundation
import MultiModalKitToB

class MultiModalManager {
    
    static let shared = MultiModalManager()
    
    private(set) var vlmGlobalConfig: AIMVLMModelConfig?
    
    // 多模态SDK 初始化
    func setup() {
        // 按需注入日志与埋点委托
        AIMultiModalManager.shared.trackDelegate = self
        AIMultiModalManager.shared.logDelegate = self
        
        // 注入鉴权委托
        AIMultiModalManager.shared.authConfigDelegate = self
        
        let config = MultiModalKitConfig(
            appId: "111",
            deviceId: "111",
            env: .online,
            asrType: .bigASR,
            ttsType: .speech
        )
        AIMultiModalManager.shared.setup(config: config)
        
        // 注入端模型文件获取委托
        AIMServiceManager.shared.register(clsName: "ExampleBusiness.ModelLoader", service: AIMMLModelLoadService.self)
        
        // 注入所需 Bridge
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
        
        // demo token 拉取逻辑，需自行申请火山相关 token 来跑通 demo
        DispatchQueue.global().async {
            guard let token = Token.shared.getVLMToken() else {
                MPUI.showToast("VLM token 刷新失败，请重启尝试")
                return
            }
            self.vlmGlobalConfig = AIMVLMModelConfig(model: Token.shared.vlmBotId, token: token)
            AIMVLMProvider.shared.setupGlobalConfig(self.vlmGlobalConfig!)
        }
        
        DispatchQueue.global().async {
            guard let _ = Token.shared.getSpeechToken() else {
                MPUI.showToast("Speech token 刷新失败，请重启尝试")
                return
            }
        }
    }
}

extension MultiModalManager: AIMultiModalAuthConfigDelegate {
    
    func speechASRAuthConfig() -> AIMSpeechAuthConfig? {
        guard let token = Token.shared.getSpeechToken() else {
            return nil
        }
        
        let config = AIMSpeechAuthConfig(
            address: "wss://openspeech.bytedance.com",
            uri: "/api/v3/sauc/bigmodel",
            resourceId: "volc.bigasr.sauc.duration",
            appId: Token.shared.speechAppId,
            token: token
        )
        return config
    }
    
    func speechTTSAuthConfig() -> AIMSpeechAuthConfig? {
        guard let token = Token.shared.getSpeechToken() else {
            return nil
        }
        
        let config = AIMSpeechAuthConfig(
            address: "wss://openspeech.bytedance.com",
            uri: "/api/v1/tts/ws_binary",
            resourceId: "volcano_tts",
            appId: Token.shared.speechAppId,
            token: token
        )
        return config
    }
}

extension MultiModalManager: AIMultiModelTrackDelegate, AIMultiModelLogDelegate {
    func track(event: String, params: [String : Any]?) {
        
    }
    
    func logInfo(message: String, file: String, function: String, line: Int) {
        Log.info(message, file: file, function: function, line: line)
    }
    
    func logError(message: String, file: String, function: String, line: Int) {
        Log.error(message, file: file, function: function, line: line)
    }
}

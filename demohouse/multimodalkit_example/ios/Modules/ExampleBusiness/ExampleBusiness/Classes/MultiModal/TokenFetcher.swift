//
//  TokenFetcher.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/6/17.
//

import Foundation

class Token {
    static let shared = Token()
    
    /**
     * 基于火山引擎的离在线语音合成SDK/流式语音识别SDK
     * 详见：https://www.volcengine.com/docs/6561/79827
     * 请先到火山控制台申请 Appid 和 Token，申请方法参考
     * https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F
     */
    let speechAppId = "YOU_SPEECH_AP_ID"
    func getSpeechToken() -> String? {
        return "YOU_SPEECH_TOKEN"
    }
    
    /**
     * 基于火山引擎的豆包大模型
     * 详见：https://www.volcengine.com/docs/82379/1541594
     * 获取Endpoint ID: https://www.volcengine.com/docs/82379/1099522
     * 获取API Key: https://www.volcengine.com/docs/82379/1541594
     */
    let vlmBotId = "YOU_VLM_ENDPOINT"
    func getVLMToken() -> String? {
        return "YOU_VLM_TOKEN"
    }
}

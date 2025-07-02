# 实时对话式 AI 硬件

## 应用介绍

整合硬件推流、 语音识别、语音合成和大模型技术，快速实现用户与智能硬件流畅、自然、真人感的实时对话功能，在智能玩具、智能家居、智能穿戴设备、智能教育设备、AI 机器人等领域赋予硬件全新的使用体验。  

### 效果预览

<a target="_blank" href="https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_74fa1ca2b33b3671f9b521435397dfa6.mp4">演示视频</a>  

### 流程架构

![img](assets/img_architecture.png)

【实时对话式 AI 硬件】是火山引擎 RTC 与嵌入式芯片厂商合作内置一站式解决方案，通过集成端侧芯片能力、实时音视频 RTC 技术以及大模型、语音技术等能力，使硬件可以实现“听、看、懂、说”能力，与用户流畅“对话”。  

在端侧，芯片集成其先进的音频处理，包括自动唤醒功能和音频3A（自动增益控制、噪声抑制、回声消除）等，保证音频输入的清晰度和准确性；在云侧，深度整合大模型、 语音识别、语音合成等人工智能技术，同时提供 Function calling 和知识库支持，使得硬件设备能够提供个性化服务和智能决策，满足用户的深层次需求。  

### 优势

**即插即用**  

与主流芯片制造商和模组方案商深度合作，提供开源 AI 语音交互框架，一天即可完成集成  

**主流芯片和模组支持**  

支持乐鑫、全志、瑞芯微、展锐、移芯、杰理、星宸、海思、君正、移远、广和通等 WiFi、Cat.1、蓝牙、ISP 等主流芯片与模组方案（更多厂商持续接入中）  

**HAL（硬件抽象层）统一接入**  

统一 RTOS 硬件抽象层开源方案，便于芯片和方案商的适配接入  

**多模态交互和其他扩展能力**  

支持视觉理解能力，支持 Function calling、知识库、联网检索等能力  

**超低性能占用**  

内存消耗可低于 300KB  

**抗弱网**  

在网络环境高达 80% 丢包率下仍能稳定流畅通话，不丢失语义信息  

**智能打断**  

无需按键输入，可双向持续对话，毫秒级人声检测与降噪能力，随时精准打断  

  

## 关联模型及云产品

### 模型

|相关服务    |描述    |计费说明    |
|-|-|-|
|<a target="_blank" href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=seedasr-streaming">Doubao-流式语音识别</a>         |将用户的语音提问转写为文本，便于大模型对用户问题的理解与回复。    |<a target="_blank" href="https://www.volcengine.com/docs/6561/1359370">多种计费方式</a>    |
|<a target="_blank" href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-1-5-pro-32k">火山方舟-大语言模型</a>         |对用户的提问进行理解并提供优质回答。     支持方舟平台上线的全量文本模型。|<a target="_blank" href="https://www.volcengine.com/docs/6561/1359370">多种计费方式</a>          |
|<a target="_blank" href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-1-5-vision-pro-32k">Doubao-vision</a>         |通过视觉理解让硬件能够感知用户周围的环境以及用户的行为，让实时互动更具沉浸感。    |<a target="_blank" href="https://www.volcengine.com/docs/6561/1359370">多种计费方式</a>     |
|<a target="_blank" href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=ve-tts">Doubao-语音合成</a>    |将模型生成的文本回答转化为自然流畅的语音输出。    |<a target="_blank" href="https://www.volcengine.com/docs/6561/1359370">多种计费方式</a>     |
|<a target="_blank" href="https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=ve-voiceclone">Doubao-声音复刻</a>         |快速复刻家人、朋友或其他个性化音色，让硬件拥有独一无二的专属声音，提供亲切温暖的专属陪伴。    |<a target="_blank" href="https://www.volcengine.com/docs/6561/1359370">多种计费方式</a>     |

### 云服务


|相关服务    |描述    |计费说明    |
|-|-|-|
|<a target="_blank" href="https://www.volcengine.com/product/veRTC/ConversationalAI">AIGC 实时互动</a>    |AI 智能体处理用户音频或视频流。    |<a target="_blank" href="https://www.volcengine.com/docs/6348/1392584">多种计费方式</a>    |
|<a target="_blank" href="https://www.volcengine.com/product/veRTC">RTC 音视频通话</a>    |房间内用户与 AI 智能体进行音频或视频对话。    |<a target="_blank" href="https://www.volcengine.com/docs/6348/69871">多种计费方式</a>    |

## 环境准备

- Linux服务器，且开发环境满足Python 3.8及以上版本。  

- 乐鑫 ESP32-S3-Korvo-2 开发板（可加入<a target="_blank" href="https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=d87of69e-75c5-47b9-bed7-f28487560489">开发者群</a>获取）。  

- 开通火山引擎实时音视频、语音识别、音频合成、火山方舟大模型服务。参看<a target="_blank" href="https://www.volcengine.com/docs/6348/1315561">开通服务</a>开通相关产品、配置角色策略并获取以下参数值：  
    - <a target="_blank" href="https://console.volcengine.com/iam/keymanage/">获取火山引擎 AK SK</a> | <a target="_blank" href="https://www.volcengine.com/docs/6291/65568">参考文档</a>  
    - 实时音视频应用 APPID  
    - 实时音视频应用 APPKEY  
    - 语音技术-语音识别-流式语音识别 APPID  
    - 语音技术-音频生成-语音合成 APPID  
    - 语音技术-音频生成-语音合成 Voice_type  
    - 火山方舟大模型 EndPointId  

- 前往<a target="_blank" href="https://console.volcengine.com/rtc/aigc/cloudRTC?from=doc">控制台</a>启用硬件场景配置。


## 快速入门
环境准备与快速入门参看<a target="_blank" href="https://github.com/volcengine/rtc-aigc-embedded-demo?tab=readme-ov-file">IoT RTC AIGC Demo 开源项目</a>说明。

## 技术实现

- 技术实现相关内容参见 <a target="_blank" href="https://www.volcengine.com/docs/6348/1438400">场景搭建</a><a target="_blank" href="https://www.volcengine.com/docs/6348/1438400">（嵌入式硬件）</a>  

- Github 源码地址：https://github.com/volcengine/rtc-aigc-embedded-demo  

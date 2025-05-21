# 实时对话式 AI 硬件

## 应用介绍

整合硬件推流、 语音识别、语音合成和大模型技术，快速实现用户与智能硬件流畅、自然、真人感的实时对话功能，在智能玩具、智能家居、智能穿戴设备、智能教育设备、AI 机器人等领域赋予硬件全新的使用体验。  

### 效果预览

<a target="_blank" href="https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_2444b3cc3fd860358fac56889f4df182.mp4">演示视频</a>  

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

- 演示示例需要申请加入策略组。Demo目前仅支持G711A编码，需要发送邮件到[Conversational_AI@bytedance.com]，主题：“申请加入LLM策略组”内容：您的RTC_APP_ID。可申请多个RTC_APP_ID。  

## 快速入门

### 运行服务端

> 服务端示例仅供开发者快速体验和演示，请勿在生产环境中使用。生产环境的服务端需要你自行开发。  


#### 硬件要求

- PC服务器（Linux 建议使用 ubuntu18.04 及以上版本）  

#### 安装服务依赖


```shell
pip install requests
```

#### 下载并配置工程

1. 克隆实时对话式 AI 硬件 Demo 示例  


    ```shell
    git clone https://github.com/volcengine/rtc-aigc-embedded-demo.git
    ```

2. 进入服务端 Demo 目录  


    ```shell
    cd rtc-aigc-embedded-demo/server/src
    ```

3. 设置配置文件  

    进入服务端配置文件 `rtc-aigc-embedded-demo/server/src/RtcAigcConfig.py`，设置如下参数  


    ```python
    # 鉴权 AK/SK。前往 https://console.volcengine.com/iam/keymanage 获取
    AK = "yzitS6Kx0x** ***fo08eYmYMhuTu"
    SK = "xZN65nz0CFZ** ****lWcAGsQPqmk"

    # 实时音视频 App ID。前往 https://console.volcengine.com/rtc/listRTC 获取或创建
    RTC_APP_ID = "678e1574** ***b9389357"
    # 实时音视频 APP KEY。前往 https://console.volcengine.com/rtc/listRTC 获取
    RTC_APP_KEY = "dc7f8939d23** *****bacf4a329"

    # 大模型推理接入点 EndPointId 前往 https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint?config=%7B%7D 创建
    DEFAULT_BOT_ID = "ep-202** ****36-plsp5"
    # 音频生成-语音合成 Voice_type，前往 https://console.volcengine.com/speech/service/8 获取
    DEFAULT_VOICE_ID = "BV05** ****aming"

    # 语音识别-流式语音识别 APPID 前往 https://console.volcengine.com/speech/service/16 获取
    ASR_APP_ID = "274** **256"
    # 音频生成-语音合成 APPID，前往 https://console.volcengine.com/speech/service/8 获取
    TTS_APP_ID = "274** **256"

    # 服务端监听端口号,你可以根据实际业务需求设置端口号
    PORT = 8080
    ```

#### 运行服务

在 `rtc-aigc-embedded-demo/server/src`目录下运行服务  


```python
python3 RtcAigcService.py
```

### 运行设备端

本文以 Mac 操作系统为例。  

#### 硬件要求

- 乐鑫 ESP32-S3-Korvo-2 开发板。  

- USB数据线（两条 A 转Micro-B 数据线，一条作为电源线，一条作为串口线）。  

- PC（Windows、Linux 或者 macOS）。  

#### 乐鑫环境配置

1. 安装 CMake 和 Ninja 编译工具  

    ```shell
    brew install cmake ninja dfu-util
    ```

2. 将 乐鑫 ADF 框架克隆到本地，并同步各子仓（submodule）代码  
    1. clone 乐鑫ADF 框架  

    ```shell
    git clone https://github.com/espressif/esp-adf.git // cloneADF框架
    ```
    2. 进入esp-adf目录  

    ```shell
    cd esp-adf 
    ```
    3. 同步各子仓代码  

    ```shell
    git submodule update --init --recursive
    ```

3. 安装乐鑫 esp32s3 开发环境相关依赖  

    ```shell
    ./install.sh esp32s3
    ```

    成功安装所有依赖后，命令行会出现如下提示  

    ```shell
    All done! You can now run:
    . ./export.sh
    ```

    > 对于 macOS 用户，如在上述任何步骤中遇到以下错误:  
    > 
    > `<urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:xxx)`  
    > 
    > 可前往访达->应用程序->Python 文件夹，点击`Install Certificates.command` 安装证书。了解更多信息，请参考 <a target="_blank" href="https://github.com/espressif/esp-idf/issues/4775">安装 ESP-IDF 工具时出现的下载错误</a>。  


4. 设置环境变量  

    > **每次打开命令行窗口均需要运行该命令进行设置**  

    ```shell
    . ./export.sh
    ```

#### 下载并配置工程

1. 将实时对话式 AI 硬件示例工程 clone 到 乐鑫 ADF examples 目录下  
    1. 进入 esp-adf/examples 目录  

    ```shell
    cd $ADF_PATH/examples
    ```
    1. clone 实时对话式 AI 硬件示例工程  

    ```shell
    git clone https://github.com/volcengine/rtc-aigc-embedded-demo.git 
    ```

2. 打开设备端配置文件 `rtc-aigc-embedded-demo/client/espressif/esp32s3_demo/main/Config.h`，设置如下参数  


    ```c
    // 你的服务端地址:监听端口号
    #define DEFAULT_SERVER_HOST "127.0.0.1:8080"

    // 服务端设置的大模型 EndPointId
    #define DEFAULT_BOT_ID "ep-20240729** **** **"

    // 服务端设置的音频生成-语音合成 Voice_type
    #define DEFAULT_VOICE_ID "zh_female_** *****"

    // 服务端设置的实时音视频 APPID
    #define DEFAULT_RTC_APP_ID "5c833ef** **** **"
    ```

3. 禁用乐鑫工程中的火山组件  
    1. 进入 esp-adf 目录  

    ```shell
    cd $ADF_PATH
    ```
    2. 禁用乐鑫工程中的火山组件  

    ```shell
    git apply $ADF_PATH/examples/rtc-aigc-embedded-demo/0001-fix-disable-volc-engine-in-esp.patch 
    ```

#### 编译固件

进入`esp-adf/examples/rtc-aigc-embedded-demo/client/espressif/esp32s3_demo` 目录下编译固件  

1. 进入 esp32s3_demo 目录  

    ```shell
    cd $ADF_PATH/examples/rtc-aigc-embedded-demo/client/espressif/esp32s3_demo
    ```
2. 设置编译目标平台  

    ```shell
    idf.py set-target esp32s3
    ```
    
3. 设置WIFI账号密码  

    ```shell
    idf.py menuconfig
    ```

  进入 `Example Connection Configuration` 菜单，在 `WiFi SSID` 及 `WiFi Password` 中填入你的 WIFI 账号和密码，保存并退出配置菜单。

4. 设置开发版型号

    ```shell
    idf.py menuconfig
    ```
  进入 `Audio HAL` 菜单，在 `Audio board` 中选择你的开发板型号。(例如: 方舟开发板选择 `M5STACK-ATOMS3R`)保存并退出配置菜单

5. 设置底层网络缓存大小

    ```shell
    idf.py menuconfig
    ```
  进入  `Component config->LWIP->UDP` 菜单，设置 `Default UDP receive mail box size`大小为 64

6. 编译固件

    ```shell
    idf.py build
    ```

#### 烧录并运行示例 Demo

1. 打开乐鑫开发板电源开关  

2. 烧录固件  


    ```shell
    idf.py flash
    ```

3. 运行示例 Demo 并查看串口日志输出  


    ```shell
    idf.py monitor
    ```

## 技术实现

- 技术实现相关内容参见 <a target="_blank" href="https://www.volcengine.com/docs/6348/1438400">场景搭建</a><a target="_blank" href="https://www.volcengine.com/docs/6348/1438400">（嵌入式硬件）</a>  

- Github 源码地址：https://github.com/volcengine/rtc-aigc-embedded-demo  

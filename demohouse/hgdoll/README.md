<p align="center">
  <img src="https://raw.githubusercontent.com/521xueweihan/HGDoll/refs/heads/main/docs/assets/icon.png" width='200'/>
  <br>中文 | <a href="docs/README_en.md">English</a>
  <br>HGDoll 是一款 AI 手机陪玩应用.
</p>

这是一款完全开源的 AI 手机陪玩应用。在你游戏时，HGDoll 可实时看到你的游戏画面，陪你聊天、为你加油鼓劲，带来有趣的陪伴体验。它基于豆包大模型和火山方舟 Arkitect 构建，包含[安卓客户端](android/README.md)（Kotlin）和[后端服务](server/README.md)（Python）两部分，支持本地运行轻松上手。

https://github.com/user-attachments/assets/704d7f2a-3206-45f2-8760-d9cf9577ca7c

目前，HGDoll 还只是一个“小玩具”，仍有许多 Bug 和改进空间，我会持续更新和完善，同时欢迎大家上手体验，一起贡献代码。

## 架构图

```mermaid
graph TD
    User((用户)) --> Android[安卓客户端]
    
    subgraph Client[客户端]
        Android --> Speech[语音识别]
        Android --> Screen[屏幕录制]
        Speech --> SpeechAPI[Doubao-流式语音识别]
        SpeechAPI --> TextResult[语音转文字结果]
        Screen --> ScreenCapture[定时截图]
        AudioPlay[语音播放] --> Android
    end
    
    subgraph Server[Server 端 Arkitect]
        TextResult --> Backend[后端服务]
        ScreenCapture --> Backend
        Backend --> TempMemory[临时记忆体]
        TempMemory --> Context[会话上下文]
        Context --> CTX1[Context-id-1]
        Context --> CTX2[Context-id-2]
        Context --> CTX3[Context-id-3]
        Context --> CTXN[...]
        Context --> Prompt[Prompt 生成]
        ImageResult[截图识别结果] --> TempMemory
        AudioResult[语音合成结果] --> AudioPlay
    end
    
    subgraph AI[AI 模型服务]
        Backend --> VLM[Doubao-vision-pro-32k]
        VLM --> ImageResult
        Prompt --> LLM[Doubao-pro-32k]
        LLM --> TTS[Doubao-语音合成]
        TTS --> AudioResult
    end

    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Client fill:#e4f7fb,stroke:#333,stroke-width:1px
    style Server fill:#e6ffe6,stroke:#333,stroke-width:1px
    style AI fill:#e6e6ff,stroke:#333,stroke-width:1px
    style Android fill:#fff,stroke:#333,stroke-width:1px
    style Backend fill:#fff,stroke:#333,stroke-width:1px
    style VLM fill:#fff,stroke:#333,stroke-width:1px
    style LLM fill:#fff,stroke:#333,stroke-width:1px
    style TTS fill:#fff,stroke:#333,stroke-width:1px
```


## 快速开始

客户端、后端的启动和安装步骤都在对应目录下，需要配置必要的 API Key 申请方法，[点击查看](docs/key.md)

### 项目结构

```
HGDoll/
├── android/          # 安卓客户端
├── server/           # 后端服务
└── docs/             # 项目文档
```

### 技术栈

#### 安卓客户端
- Kotlin
- Jetpack Compose
- Gradle Kotlin DSL
- AndroidX

#### 后端服务
- Python 3.8-3.12
- FastAPI
- 火山方舟 Arkitect SDK
- Uvicorn


## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

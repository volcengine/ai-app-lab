<p align="center">
  <img src="https://raw.githubusercontent.com/521xueweihan/HGDoll/refs/heads/main/docs/assets/icon.png" width='200'/>
  <br><a href="README.md">中文</a> | English
  <br>HGDoll is an AI mobile companion app.
</p>

This is a fully open-source AI mobile gaming companion app. While you play games, HGDoll can view your game screen in real time, chat with you, and cheer you on, bringing a fun and engaging companion experience. It is built on the Doubao LLM and Volcano Arkitect, consisting of an Android client (Kotlin) and a backend service (Python), both easy to run locally.

Currently, HGDoll is still a "toy" project with many bugs and areas for improvement. We welcome you to try it out and contribute code to help us make it better!

## Architecture Diagram

```mermaid
graph TD
    User((User)) --> Android[Android Client]
    
    subgraph Client[Client Side]
        Android --> Speech[Speech Recognition]
        Android --> Screen[Screen Recording]
        Speech --> SpeechAPI[Doubao Streaming ASR]
        SpeechAPI --> TextResult[Speech-to-Text Result]
        Screen --> ScreenCapture[Periodic Screenshots]
        AudioPlay[Audio Playback] --> Android
    end
    
    subgraph Server[Server Side Arkitect]
        TextResult --> Backend[Backend Service]
        ScreenCapture --> Backend
        Backend --> TempMemory[Temporary Memory]
        TempMemory --> Context[Session Context]
        Context --> CTX1[Context-id-1]
        Context --> CTX2[Context-id-2]
        Context --> CTX3[Context-id-3]
        Context --> CTXN[...]
        Context --> Prompt[Prompt Generation]
        ImageResult[Screenshot Recognition Result] --> TempMemory
        AudioResult[Speech Synthesis Result] --> AudioPlay
    end
    
    subgraph AI[AI Model Service]
        Backend --> VLM[Doubao-vision-pro-32k]
        VLM --> ImageResult
        Prompt --> LLM[Doubao-pro-32k]
        LLM --> TTS[Doubao Speech Synthesis]
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

## Quick Start

Startup and installation instructions for both the client and backend can be found in their respective directories. For API Key configuration, [see here](docs/key.md).

### Project Structure

```
HGDoll/
├── android/          # Android client
├── server/           # Backend service
└── docs/             # Project documentation
```

### Tech Stack

#### Android Client
- Kotlin
- Jetpack Compose
- Gradle Kotlin DSL
- AndroidX

#### Backend Service
- Python 3.8–3.12
- FastAPI
- Volcano Arkitect SDK
- Uvicorn

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

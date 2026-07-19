# HGDoll 后端

HGDoll 后端依赖于火山方舟开源的用于开发高代码应用的 Python SDK——Arkitect 它面向具有专业开发能力的开发者，提供开发大模型应用需要用到的工具集和流程集。更多介绍见 [高代码 SDK Arkitect](https://github.com/volcengine/ai-app-lab/blob/main/arkitect/README.md)。


## 一、快速开始

本文为您介绍如何在本地快速部署 HGDoll Server 端（Python 3.8-3.12），[点击查看](../docs/key.md)如何申请运行所需的 API Key。

### 1.1 下载代码库

```bash
git clone https://github.com/521xueweihan/HGDoll.git
cd server/
```

注意：下面所有命令都将在 `server/` 目录下执行。

### 1.2 修改配置

修改 `server/src/config.py` 中配置，填入下面的配置变量。

| 配置变量名   | 说明                              |
| ------------ | --------------------------------- |
| VLM_ENDPOINT | doubao-vision-pro 32k endpoint id |
| LLM_ENDPOINT | doubao-pro 32k endpoint id        |
| TTS_APP_ID   | 语音合成模型 APP ID          |
| TTS_ACCESS_TOKEN      | 语音合成模型 Access Token           |

修改 `server/run.sh` 中配置，填入 API Key。

| 配置变量名  | 说明             |
| ----------- | ---------------- |
| ARK_API_KEY | 火山方舟 API Key |

### 1.3 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 1.4 启动和测试

```bash
bash run.sh

INFO:     Started server process [2669]
INFO:     Waiting for application startup.
2025-04-24 15:32:08 [debug    ] singleton class initialized    name=ClientPool
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8888 (Press CTRL+C to quit)
```

### 1.5 测试

```bash 
curl -i http://localhost:8888/v1/ping

HTTP/1.1 200 OK
date: Thu, 24 Apr 2025 07:32:47 GMT
server: uvicorn
content-length: 2
content-type: application/json
x-request-id: 202504241532470000897F8BFC9C815122
x-client-request-id: 202504241532470000897F8BFC9C815122
```

> **💡 说明**
> 本 Demo 仅仅用于测试，实际生产环境请根据存储类型，实现 `server/src/utils.py` 中 Storage Class 的接口，来实现长期记忆的功能。
# 电商营销视频生成 E-commerce Marketing Video Generation

## 应用介绍

> 本项目通过支持 A2A 的 Multi-Agent 实现电商营销视频生成，该系统由营销策划、视频导演、评估、合成与发布 4 个 Agent 组成，提供从视频创意构思、高质量视频生成、到视频上线发布的端到端解决方案。面向需要快速、批量化生产营销短视频的电商客户或营销团队，旨在降低视频制作门槛，提高营销内容生产效率。


### 费用说明

| 相关服务                                                                                                        | 描述                | 计费说明 |
|-------------------------------------------------------------------------------------------------------------|-------------------| --- |
| [Doubao-Seed-1.6](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-1-6) | 负责理解用户信息并转化为工具调用。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) 
| [Doubao-Seedance 1.0 pro](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seedance-1-0-pro)  | 负责将图片和文字描述转为视频。   | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |\
| [Doubao-Seedream 4.5 pro](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seedream-4-5)  | 负责根据文字或参考图生成图片    | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |\


## 环境准备

开始前，请确保您的开发环境满足以下要求：

- Python 3.10 或更高版本
- VeADK 0.2.28 或更高版本
- Playwright 1.55.0 或更高版本
- 推荐使用 `uv` 进行依赖管理
- <a target="_blank" href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey">获取火山方舟 API KEY</a>
- <a target="_blank" href="https://console.volcengine.com/iam/keymanage/">获取火山引擎 AK/SK</a>

## 快速入门

请按照以下步骤在本地部署和运行本项目。

### 1. 下载代码并安装依赖

```bash
# 克隆代码仓库
# git clone ...
# cd ...

# 安装项目依赖
uv sync
```

### 2. 配置环境变量

本项目包含多个 Agent，每个 Agent 都需要独立的配置。请参考 `config.yaml.example` 文件为每个 Agent 创建 `config.yaml` 并填入必要的密钥信息。

以 `director-agent` 为例：
```bash
# 进入 director-agent 目录
cd app/director-agent

# 复制配置文件
cp config.yaml.example config.yaml
```
然后，编辑 `config.yaml` 文件，填入您的火山方舟 API Key、火山引擎 AK/SK 等信息。请为 `market-agent`、`evaluate-agent`、`release-agent`、`multimedia-agent` 重复此操作。

具体配置项可参考 <a target="_blank" href="https://github.com/volcengine/veadk-python/blob/main/config.yaml.full">veadk-python config.yaml 配置文档</a>。

### 3. 安装 Playwright 浏览器组件

`market-agent` 需要 Playwright 来解析网页内容。

```bash
# market-agent
# 安装 Playwright 浏览器依赖
playwright install
```

### 4. 启动服务

请按顺序启动各个 Agent 服务。

```bash
# 激活虚拟环境
# Windows (Powershell)
# .\.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate

# 启动 market-agent
cd backend/app/market-agent/src
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --loop asyncio

# 启动 director-agent
cd backend/app/director-agent/src
python -m uvicorn app:app --host 127.0.0.1 --port 8001 --loop asyncio

# 启动 evaluate-agent
cd backend/app/evaluate-agent/src
python -m uvicorn app:app --host 127.0.0.1 --port 8002 --loop asyncio

# 启动 release-agent
cd backend/app/release-agent/src
python -m uvicorn app:app --host 127.0.0.1 --port 8003 --loop asyncio

# 最后启动 multimedia-agent
cd backend/app/multimedia-agent/src
python -m uvicorn server:app --host 127.0.0.1 --port 8004 --loop asyncio

# 启动 short_link 服务
cd backend/app/short_link
python -m uvicorn app:app --host 127.0.0.1 --port 8005 --loop asyncio
```

### 5. 测试服务

所有服务启动后，可运行测试脚本验证。

```bash
python backend/app/main.py
```

**示例提示词：**
- `根据https://...这个网站中的商品信息，给我生成一段视频`


## 技术实现

本项目核心为一套基于 VeADK 构建的多 Agent 协作框架。各 Agent 职责明确，通过 A2A (Agent-to-Agent) 通信协同工作，完成从需求理解到视频发布的完整流程。

- **营销策划 Agent (`market-agent`)**: 负责解析用户输入（如商品链接），进行市场分析并形成初步的营销策略和视频创意。
- **视频导演 Agent (`director-agent`)**: 根据营销策略，生成具体的视频脚本、文案，并调用多模态能力（文生图、图生视频）产出视频素材。
- **评估 Agent (`evaluate-agent`)**: 对生成的视频素材进行质量评估和筛选，通过自主评测机制进行抽卡优化，确保视频质量。
- **合成与发布 Agent (`release-agent`)**: 将筛选后的素材合成为最终视频，并提供发布能力。

## 目录结构

```
/
├── README.md                 # 本文档
├── backend/app/
│   ├── __init__.py
│   ├── director-agent/       # 视频导演Agent
│   │   ├── config.yaml.example # 配置文件示例
│   │   └── src/                # Agent源码
│   ├── evaluate-agent/       # 评估Agent
│   │   ├── config.yaml.example
│   │   └── src/
│   ├── main.py                 # 测试用主程序
│   ├── market-agent/         # 营销策划Agent
│   │   ├── config.yaml.example
│   │   └── src/
│   ├── multimedia-agent/       # 主Agent，负责协调其他Agent
│   │   ├── config.yaml.example
│   │   └── src/
│   ├── release-agent/        # 发布Agent
│   │   ├── config.yaml.example
│   │   └── src/
│   └── short_link/           # 视频短链接生成工具
│       ├── app.py
│       └── requirements.txt
└── ... (其他项目文件)
```

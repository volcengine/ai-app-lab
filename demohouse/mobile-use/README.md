# Mobile Use - Solution for Mobile AI Infra to Agent 

English | [简体中文](README_zh.md)


## 🚀 Overview

[Mobile Use Product Documentation](https://www.volcengine.com/docs/6394/1583515)


**Mobile Use** is an AI Agent solution based on **Volcano Engine Cloud Phone** and **Doubao Visual Large Model** capabilities, which is able to complete automated tasks for mobile scenarios through natural language instructions.

Currently, Mobile Use has been officially launched on [veFaaS Application Center](https://console.volcengine.com/vefaas/region:vefaas+cn-beijing/market). Click to experience our Mobile Use Agent demo online through the link. If you want to develop your own Mobile Use Agent, go to [one-click deployment](https://console.volcengine.com/vefaas/region:vefaas+cn-beijing/application/create) to quickly complete the deployment process and start a journey of integrating Mobile Use Agent into your business flow.


## ✨ Features

- **AI-Powered Automation**: Accurately identify, understand and click on mobile applications and complex scenarios based on Doubao visual large model
- **Cloud Phone Integration**: Execute automated tasks in a secure, stable and low-latency Cloud Phone isolated environment
- **MCP Protocol Support**: Standard Model Context Protocol (MCP) Tool: [Mobile Use MCP](https://github.com/volcengine/mcp-server/tree/main/server/mcp_server_mobile_use)
- **Web Interface**: Modern React/Next.js web interface for interaction and monitoring
- **Real-time Streaming**: SSE-based real-time communication and feedback
- **Extensible Architecture**: Modular design for easy extension and intregration into actual business flow

## 🏗️ Architecture

The project consists of three main components:

```
mobile-use/
├── mobile_agent/      # Python AI Agent Core
├── mobile_use_mcp/    # Go MCP Server
└── web/              # Next.js Web Frontend
```

### Core Components

1. **Mobile Agent** (Python)
   - AI reasoning and decision making
   - Vision model integration
   - Task orchestration and execution
   - Memory and context management

2. **MCP Server** (Go)
   - Cloud phone interaction layer
   - Standard MCP protocol implementation
   - Mobile automation tools and APIs

3. **Web Frontend** (Next.js)
   - User interface and interaction
   - Real-time monitoring and feedback
   - Task management and visualization

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture cloud phone screen |
| `tap` | Tap at specified coordinates |
| `swipe` | Perform swipe gestures |
| `text_input` | Input text on screen |
| `home` | Go to home screen |
| `back` | Go back to previous screen |
| `menu` | Open menu |
| `autoinstall_app` | Auto-download and install apps |
| `launch_app` | Launch apps |
| `close_app` | Close apps |
| `list_apps` | List all installed apps |

## 🚦 Quick Start

### Prerequisites

- **Node.js** >= 20 (use [nvm](https://github.com/nvm-sh/nvm) for version management) 
- **Python** >= 3.11 (use [uv](https://docs.astral.sh/uv/) for dependency management)
- **Go** >= 1.23 (for MCP server) [install](https://go.dev/doc/install)
> [!NOTE]
> mobile_use_mcp currently only supports Linux systems build


### Installation

1. **Clone the repository**

```bash
git clone https://github.com/volcengine/ai-app-lab.git
cd demohouse/mobile-use
```

2. **Install dependencies**
```bash
sh setup.sh
```

3. **Configure environment**
```bash
# Copy and edit configuration files
cp mobile_agent/.env.example mobile_agent/.env
cp web/.env.example web/.env
# Edit configuration with your API keys and endpoints
```

### agent config
```bash
MOBILE_USE_MCP_URL= # MCP_SSE service URL http://xxxx.com/mcp, local url is http://localhost:8888/mcp

TOS_BUCKET= # Volcengine Object Storage bucket
TOS_REGION= # Volcengine Object Storage region
TOS_ENDPOINT= # Volcengine Object Storage endpoint

ARK_API_KEY= # Volcengine API key
ARK_MODEL_ID= # Volcengine model ID

ACEP_AK= # Volcengine cloud phone AK
ACEP_SK= # Volcengine cloud phone SK
ACEP_ACCOUNT_ID= # Volcengine accountID
```

### web config

```bash
CLOUD_AGENT_BASE_URL= # agent service URL http://xxxx.com/mobile-use/
```

4. **Start services**

Start MCP server:
```bash
cd mobile_use_mcp
go run cmd/mobile_use_mcp/main.go  -t sse -p 8888
```

Start the mobile agent service:
```bash
cd mobile_agent
uv venv
source .venv/bin/activate
uv pip install -e .
uv run main.py
```

Start web frontend:
```bash
cd web
npm run dev
```


5. **Access the application**

Configure `MOBILE_AGENT_ACCESS_GRANTS` in the agent environment first; see
[security setup](mobile_agent/SECURITY.md). Open `http://localhost:8080?token=<your-access-token>`
with a valid credential bound to your user and cloud phone. Arbitrary tokens are rejected.

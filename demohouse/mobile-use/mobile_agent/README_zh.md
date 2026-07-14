# Mobile Agent - AI移动设备自动化代理核心

[English](README.md) | 简体中文


## 🏗️ 架构设计

```
mobile_agent/
├── mobile_agent/
│   ├── agent/              # 核心代理逻辑
│   │   ├── mobile_use_agent.py    # 主代理类
│   │   ├── graph/          # LangGraph工作流
│   │   ├── tools/          # 工具管理
│   │   ├── prompt/         # 提示词模板
│   │   ├── memory/         # 记忆管理
│   │   ├── mobile/         # 移动设备交互
│   │   ├── llm/           # 大语言模型接口
│   │   ├── cost/          # 成本计算
│   │   ├── infra/         # 基础设施
│   │   └── utils/         # 工具函数
│   ├── config/            # 配置管理
│   ├── routers/           # API路由
│   ├── service/           # 业务服务
│   ├── middleware/        # 中间件
│   └── exception/         # 异常处理
├── config.toml           # 配置文件
├── requirements.txt      # 依赖管理
├── pyproject.toml       # 项目配置
└── main.py             # 应用入口
```

## 🚀 快速开始

### 环境要求

- **Python** >= 3.11
- **uv** (推荐的Python包管理器)
- 豆包模型API密钥
- 云手机服务访问权限

### 安装步骤

1. **安装依赖**
```bash
cd mobile_agent
uv sync
```

2. **配置环境**
```bash
# 编辑配置文件，填入你的API密钥和服务端点
cp .env.example .env
```

3. **启动服务**
```bash
# 开发模式
uv run main.py
```

该 HTTP 服务仅预期在本机使用。`main.py` 会始终监听 `127.0.0.1`，
即使配置了其他 `UVICORN_SERVER_HOST` 也不会对外网卡暴露。

### 配置说明

```bash
MOBILE_USE_MCP_URL= # MCP_SSE 服务地址 http://xxxx.com/sse

TOS_BUCKET= # 火山引擎对象存储桶
TOS_REGION= # 火山引擎对象存储区域
TOS_ENDPOINT= # 火山引擎对象存储终端

ARK_API_KEY= # 火山引擎API密钥
ARK_MODEL_ID= # 火山引擎模型ID

ACEP_AK= # 火山引擎 AK
ACEP_SK= # 火山引擎 SK
ACEP_ACCOUNT_ID= # 火山引擎 账号ID
```

## 🛠️ 核心组件

通过 Mobile Use MCP 支持的移动设备操作：

| 工具名称 | 功能描述 | 参数 |
|---------|---------|------|
| `mobile:screenshot` | 截取设备屏幕 | - |
| `mobile:tap` | 点击屏幕坐标 | `x, y` |
| `mobile:swipe` | 滑动手势 | `from_x, from_y, to_x, to_y` |
| `mobile:type` | 文本输入 | `text` |
| `mobile:home` | 返回主屏幕 | - |
| `mobile:back` | 返回上一级 | - |
| `mobile:close_app` | 关闭应用 | `package_name` |
| `mobile:launch_app` | 启动应用 | `package_name` |
| `mobile:list_apps` | 列出已安装应用 | - |

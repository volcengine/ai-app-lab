# Planner

## Project Overview
Planner is a Python-based project designed to implement a GUI intelligent agent that interacts with remote desktop environments through the MCP (Multi-Command Protocol) server. The project supports multiple AI model clients, including UiTars and Doubao, and can execute tasks based on user instructions while providing real-time feedback through server-sent events (SSE).

## Key Features
- **Task Execution**: Execute various computer operation tasks based on user instructions, continuously interact with the desktop environment, and use screenshots to assist decision-making
- **Tool Integration**: Obtain available tools from the MCP server and use these tools to complete tasks, including mouse clicks, keyboard input, scrolling, etc.
- **Real-time Communication**: Implement real-time communication with clients through SSE (Server-Sent Events), providing task status updates, screenshots, and tool execution results
- **Screenshot Management**: Manage screenshot history to ensure the agent can access the latest environmental information during task execution

## Project Structure
```
planner/
├── README.md                # Module documentation
├── config.toml              # Configuration settings
├── pyproject.toml           # Project build configuration
├── requirements.txt         # Project dependencies
├── src/
│   └── planner/             # Main planner module
│       ├── app.py           # FastAPI application entry point
│       ├── main.py          # Main application entry point
│       ├── client/          # Client implementations
│       │   ├── init .py
│       │   ├── model_client.py # AI model client interface
│       │   ├── mcp_sse_client.py # MCP server client
│       │   ├── sandbox_manager_client.py # Sandbox management client
│       │   └── sandbox_use_mcp_adaptor.py # MCP protocol adapter
│       ├── common/          # Shared modules
│       │   ├── init .py
│       │   ├── config.py    # Configuration management
│       │   ├── constants.py # Constants
│       │   ├── logger.py    # Logging management
│       │   └── ui_interface.py # UI interface
│       └── services/        # Business logic layer
│           ├── init .py
│           └── planner.py   # Planner service
└── uv.lock                  # Dependency lock file
```

## Installation Instructions
### Prerequisites
- Python 3.12 or higher
- uv (Python package manager)

### Local Installation
1. Clone the repository:
```bash
git clone https://github.com/volcengine/ai-app-lab.git
```

2. Create a virtual environment and install dependencies:
```bash
cd ai-app-lab/demohouse/computer-use/planner
uv venv --python 3.12 && source .venv/bin/activate && uv sync
```

## Configuration

planner's main configuration file is located at:

```
config.toml
```

This configuration file contains key settings for the server, such as models and mcp server configurations.

## Usage

### Start the Server
```bash
uv run src/planner/main.py
```

### Send Task Requests
Send a POST request to http://localhost:8089/run/task with the following JSON body:

```json
{
    "user_prompt": "Task description",
    "sandbox_id": "Sandbox ID",
    "system_prompt": "System prompt (optional)",
    "model": "doubao-1.5-ui-tars-250328"
}
```

## API Endpoints

- `GET /health` - Health check
- `GET /models` - Get available models
- `POST /run/task` - Execute task, returns SSE event stream

## How It Works
1. Client sends task request to Agent Planner service
2. Service connects to MCP server and initializes environment
3. AI model analyzes current screen state and decides next action
4. Execute action (click, input, etc.) and get new screen state
5. Repeat steps 3-4 until task is completed or max rounds reached
6. Return execution status and results to client in real-time through SSE

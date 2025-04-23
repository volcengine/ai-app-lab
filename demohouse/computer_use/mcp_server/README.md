# Computer Use Mcp Server 

## Overview

An model context protocol server for MCP client(like Claude Desktop) to control your computer. With this MCP server, clients are capable of interacting with tools that can manipulate a computer desktop environment.

## Features

- Trigger mouse events (move, click, scroll, and drag)
- Trigger keyboard events (key press, type text)
- Retrieve cursor position
- Retrieve screen information (screenshot, screen size)

## Available Tools

- `move_mouse`: Move the mouse to the specified coordinates.
- `click_mouse`: Perform a mouse click with the specified button.
- `drag_mouse`: Drag the mouse to the specified coordinates.
- `scroll`: Scroll the mouse wheel.
- `press_key`: Press the specified key.
- `type_text`: Type the specified text.
- `get_cursor_position`: Retrieve the current cursor position.
- `screen_shot`: Retrieve the current screen size.


## Getting Started
### Prerequisites
- Python 3.12+
- UV

**Linux/macOS:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows:**
```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**pip**
```bash
pip install uv
```

### Usage
Start the server:

#### UV
```bash
cd computer-use/mcp_server
uv run mcp-server

# Start with stdio mode (default sse)
uv run mcp-server -t stdio
```


#### Docker
```bash
cd computer-use/mcp_server

# build image
docker build -t mcp-server:latest .

# run container
docker run -d                                \
  -p 8000:8000                               \
  -e FASTMCP_PORT=8000                       \
  -e TOOL_SERVER_ENDPOINT="127.0.0.1:8102"   \
  mcp-server

```
Use the client to interact with the server.
```
Agent Planner | Claude Desktop | Cursor | Chainlit | ...
```

## Configuration

MCP server's main configuration file is located at:

```
settings.toml

# we use local to control deployment type of tool server
# local = true means mcp server deploy with tool server locally
# local = false means remote and need tool server endpoint

[tool_server]
local = false
endpoint = "127.0.0.1:8102"

```

This configuration file contains key settings for the server, such as logging and tool server configurations.


### Environment Variables

The following environment variables are available for configuring the MCP server:

| Environment Variable | Description | Default Value |
|----------|------|--------|
| `FASTMCP_PORT` | MCP server listening port | `8000` |
| `TOOL_SERVER_ENDPOINT` | Tool server endpoint | `127.0.0.1:8102` |

For example, set these environment variables before starting the server:

```bash
export FASTMCP_PORT=8000
export TOOL_SERVER_ENDPOINT="127.0.0.1:8102"
cd computer-use/mcp_server
uv run mcp-server
```

## Project Structure

```mcp_server/
│
├── src/                      # Source code directory
│   ├── mcp_server/           # Main package directory
│   │   ├── tools/            # Tool implementation modules
│   │   │   ├── computer.py   # Computer control implementations
│   │   └── common/           # Shared utilities
│   │       ├── client.py     # Client utilities
│   │       ├── errors.py     # Error utilities
│   │       ├── logs.py       # Logging utilities
│   │       └── config.py     # Configuration management
│   └── main.py               # Application entry point
│
├── pyproject.toml            # Project metadata and dependencies
├── settings.toml             # Project config settings
├── uv.lock                   # Dependency lock file
├── Dockerfile                # Container definition
└── README.md                 # Project documentation
```

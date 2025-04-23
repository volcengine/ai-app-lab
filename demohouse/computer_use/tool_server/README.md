# Computer Use Tool Server

## Overview

Computer Use Tool Server is a FastAPI-based server application that allows clients to control computer desktop environments through API interfaces. This server can be integrated with clients supporting the Model Context Protocol (MCP), enabling AI assistants to perform various computer operations.

## Features

- Mouse operations: move, click, drag, and scroll
- Keyboard operations: key press and text input
- Screen operations: screenshots and screen information
- System operations: cursor position retrieval and wait operations

## Getting Started

### Prerequisites

- Python 3.12+
- UV (Python package manager)

**Installing UV:**

**Linux/macOS:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows:**
```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**Install via pip:**
```bash
pip install uv
```

### Installation

Clone the repository:
```bash
git clone https://github.com/volcengine/ai-app-lab.git
cd computer-use/tool_server
```

Install dependencies:
```bash
uv pip install -e .
```

### Usage

Start the server:
```bash
# Default mode
python main.py
```

Once the server is running, you can interact with it through the API interface.

## API Features

All API calls use version `2020-04-01` and are sent via GET requests.

### Available Operations

- `MoveMouse`: Move the mouse to specified coordinates
- `ClickMouse`: Perform a mouse click at specified position
- `DragMouse`: Drag from a starting point to a target point
- `Scroll`: Scroll the mouse wheel at a specified position
- `PressKey`: Press the specified key
- `TypeText`: Input specified text
- `Wait`: Wait for a specified time
- `TakeScreenshot`: Capture a screenshot
- `GetCursorPosition`: Get current cursor position
- `GetScreenSize`: Get screen size information

## Project Structure

```
computer-use-tool-server/
│
├── common/                # Shared utilities directory
│   ├── __init__.py       # Package initialization file
│   ├── config.py         # Configuration management
│   └── logger.py         # Logging utilities
│
├── middleware/           # Middleware directory
│
├── services/             # Services directory
│   ├── __init__.py       # Package initialization file
│   ├── router.py         # API route definitions
│   └── api_20200401/     # API version implementation
│
├── tools/                # Tool implementation directory
│   ├── __init__.py       # Package initialization file
│   ├── base.py           # Base tool classes and functions
│   ├── computer.py       # Computer operation tool implementation
│   ├── computer_pyautogui.py # PyAutoGUI implementation
│   ├── computer_xdotool.py   # XDoTool implementation
│   ├── constants.py      # Constants definitions
│   ├── file.py           # File operation tools
│   ├── password.py       # Password management tools
│   └── run.py            # Command execution tools
│
├── config.toml           # Configuration file
├── main.py               # Application entry point
├── pyproject.toml        # Project metadata and dependencies
├── uv.lock               # Dependency lock file
└── README.md             # Project documentation
```

## Configuration

Configuration can be set through the `config.toml` file, primarily containing server port, logging level, and other parameters.

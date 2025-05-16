# ECS Manager

## Overview

ECS Manager is a FastAPI-based server application that allows clients to manage cloud instances through API interfaces. This server can be integrated with various clients, enabling efficient creation, deletion, and management of sandbox environments.

## Features

- Sandbox creation: create new cloud instances
- Sandbox deletion: remove cloud instances
- Sandbox inspection: view details of existing sandboxes
- Terminal access: generate terminal URLs for sandbox access
- VNC validation: validate VNC tokens for secure access

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
git clone [repository-url]
cd ecs_manager
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

- `CreateSandbox`: Create a new sandbox instance
- `DeleteSandbox`: Delete an existing sandbox
- `DescribeSandboxes`: List details of existing sandboxes
- `DescribeSandboxTerminalUrl`: Get terminal URL for sandbox access
- `ValidateVncToken`: Validate VNC token for remote access

## Project Structure

```
ecs_manager/
│
├── common/                # Shared utilities directory
│   ├── __init__.py       # Package initialization file
│   ├── config.py         # Configuration management
│   └── utils.py          # Utility functions
│
├── middleware/           # Middleware directory
│
├── services/             # Services directory
│   ├── __init__.py       # Package initialization file
│   ├── router.py         # API route definitions
│   └── api_20200401/     # API version implementation
│       ├── __init__.py   # Package initialization file
│       ├── manager.py    # Base manager interface
│       └── manager_ecs.py # ECS implementation
│
├── config.toml           # Configuration file
├── main.py               # Application entry point
├── pyproject.toml        # Project metadata and dependencies
├── uv.lock               # Dependency lock file
└── README.md             # Project documentation
```

## Configuration

Configuration can be set through the `config.toml` file, primarily containing:
- Server settings
- VolcEngine credentials 
- Instance configuration
- Network settings
- Security parameters

# veFaaS MCP Server

This project provides a MCP server for managing veFaaS (Volc Engine Function as a Service) functions. It allows you to create, update, release, and manage veFaaS functions through a simple interface.

## Features

- Create new VeFaaS functions with random names
- Update function code using:
  - Base64-encoded zip files
  - TOS (Tencent Object Storage) objects
  - Container images
- Release functions for production use
- Check function existence and status
- Create base64-encoded zip files from Python code

## Prerequisites

- Python 3.12+
- Access to Volc Engine (ACCESS_KEY_ID and ACCESS_KEY_SECRET)

## Getting started

- Configure

Please set the value for envirable variable ACCESS_KEY_ID and ACCESS_KEY_SECRET in [](./mcp.json)

```json
{
  "mcpServers": {
    "vefaas": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_vefaas_function",
        "mcp-server-vefaas-function"
      ],
      "env": {
        "ACCESS_KEY_ID": "xxx",
        "ACCESS_KEY_SECRET": "xxx"
      }
    }
  }
}
```

- Run
Use veFaaS MCP Server in a MCP client, like 火山方舟/Cursor/Claude macOS app/5fire.

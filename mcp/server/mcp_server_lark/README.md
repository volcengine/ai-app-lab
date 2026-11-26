# Lark MCP Server

MCP Server for the Lark API

## Tools

1. `create_document`
   - Create document in a folder
   - Optional inputs:
     - `document_name` (string):  name of the document
     - `dest_folder_token` (string): folder token. Optional. If not set, it will take configured default value
   - Returns: str

2. `write_text`
   - Write content into a document
   - Required inputs:
     - `document_id` (string): The ID of the document
     - `body` (string): document body
   - Returns: Any

3. `send_message`
   - Send message to a person or a chat group. You can configure a contact list to whom the agent can send to.
   - Required inputs:
     - `message` (string): The content to send
     - `contact_name` (string): The person/group name to send to
   - Returns: Any

## Setup

1. Create a Lark App
   
    Check out [this doc](https://bytedance.sg.larkoffice.com/docx/WAXHduITJoVYVExGXfNlRKqYgaf) for details on how to create your lark app

2. Configure config.yaml

    Copy `config.template.yaml` into `config.yaml` and fill in your app's detail

    Check out [this doc](https://bytedance.sg.larkoffice.com/docx/WAXHduITJoVYVExGXfNlRKqYgaf) for details on how to obtain the configs.

3. Run the server

    There are two ways to run the MCP Lark server:

    ### Option 1: Direct Command
    Run the server directly using:
    ```bash
    uvx --from git+https://github.com/volcengine/mcp-server@master#subdirectory=server/mcp_server_lark \
        mcp-server-lark \
        --transport stdio \
        --config /path/to/config.yaml
    ```

    ### Option 2: Claude Desktop Integration
    1. Visit the [Claude Desktop Quick Start Guide](https://modelcontextprotocol.io/quickstart/user)
    2. Create or update your `mcp.json` configuration file:
    ```json
    {
      "mcpServers": {
        "lark": {
          "command": "uvx",
          "args": [
            "--from",
            "git+https://github.com/volcengine/mcp-server@master#subdirectory=server/mcp_server_lark",
            "mcp-server-lark",
            "--transport",
            "stdio",
            "--config",
            "/path/to/config.yaml"
          ]
        }
      }
    }
    ```

    > **Note**: Replace `/path/to/config.yaml` with the actual path to your configuration file.

4. Debug

After starting your server, start your inspector

```bash
npx @modelcontextprotocol/inspector
```

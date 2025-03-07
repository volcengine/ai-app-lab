# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import datetime
import logging
from contextlib import AsyncExitStack
from typing import Any, Dict

from mcp import ClientSession, StdioServerParameters, Tool, stdio_client
from mcp.client.sse import sse_client
from volcenginesdkarkruntime.types.chat import ChatCompletionContentPartParam

from arkitect.core.component.tool.utils import (
    convert_to_chat_completion_content_part_param,
    mcp_to_chat_completion_tool,
)
from arkitect.types.llm.model import ChatCompletionTool

logger = logging.getLogger(__name__)


class MCPClient:
    def __init__(self) -> None:
        # Initialize session and client objects
        self.session: ClientSession = None  # type: ignore
        self.exit_stack = AsyncExitStack()
        self.tools: Dict[str, Tool] = {}
        self._mcp_server_name: str | None = None
        self._chat_completion_tools: dict[str, ChatCompletionTool] = {}

    async def connect_to_server(
        self,
        server_url: str | None = None,
        server_script_path: str | None = None,
        env: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 5,
        sse_read_timeout: float = 60 * 5,
    ) -> None:
        """Connect to an MCP server running with SSE or STDIO transport"""
        # Store the context managers so they stay alive
        if server_url is not None and server_script_path is not None:
            raise ValueError("You should set either erver_url or server_script_path")
        if server_url is not None:
            await self._connect_to_sse_server(
                server_url, headers, timeout, sse_read_timeout
            )
        elif server_script_path is not None:
            await self._connect_to_stdio_server(
                server_script_path=server_script_path, env=env
            )
        else:
            raise ValueError("You should set either erver_url or server_script_path")

    async def _connect_to_stdio_server(
        self, server_script_path: str, env: dict[str, str] | None = None
    ) -> None:
        """Connect to an MCP server
        Args:
            server_script_path: Path to the server script (.py or .js)
        """
        is_python = server_script_path.endswith(".py")
        is_js = server_script_path.endswith(".js")
        if not (is_python or is_js):
            raise ValueError("Server script must be a .py or .js file")

        command = "python" if is_python else "node"
        server_params = StdioServerParameters(
            command=command, args=[server_script_path], env=env
        )

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        stdio_read, stdio_write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(
                stdio_read,
                stdio_write,
                read_timeout_seconds=datetime.timedelta(seconds=10),
            )
        )

        # Initialize
        await self._init()

    async def _connect_to_sse_server(
        self,
        server_url: str,
        headers: dict[str, str] | None = None,
        timeout: float = 5,
        sse_read_timeout: float = 60 * 5,
    ) -> None:
        """Connect to an MCP server running with SSE transport"""
        # Store the context managers so they stay alive
        streams = await self.exit_stack.enter_async_context(
            sse_client(
                url=server_url,
                headers=headers,
                timeout=timeout,
                sse_read_timeout=sse_read_timeout,
            )
        )

        self.session = await self.exit_stack.enter_async_context(
            ClientSession(*streams)
        )

        # Initialize
        await self._init()

    async def _init(self) -> None:
        # Initialize
        logger.info("Initialized mcp client...")
        init_result = await self.session.initialize()
        # List available tools to verify connection
        logger.info("Listing tools...")
        response = await self.session.list_tools()
        self.tools = {t.name: t for t in response.tools}
        self._chat_completion_tools = {
            t.name: mcp_to_chat_completion_tool(t) for t in response.tools
        }
        logger.info(
            "Connected to server with tools: %s",
            [(tool.name, tool.inputSchema) for tool in self.tools.values()],
        )
        self._mcp_server_name = init_result.serverInfo.name

    async def cleanup(self) -> None:
        """Clean up resources"""
        await self.exit_stack.aclose()

    async def list_mcp_tools(self, use_cache: bool = True) -> list[Tool]:
        if not use_cache:
            response = await self.session.list_tools()
            self.tools = {t.name: t for t in response.tools}
        return list(self.tools.values())

    async def list_tools(self, use_cache: bool = True) -> list[ChatCompletionTool]:
        if not use_cache:
            response = await self.session.list_tools()
            self.tools = {t.name: t for t in response.tools}
            self._chat_completion_tools = {
                t.name: mcp_to_chat_completion_tool(t) for t in response.tools
            }
        return list(self._chat_completion_tools.values())

    @property
    def name(self) -> str:
        if self._mcp_server_name is None:
            raise ValueError("MCP client is not connected to server yet")
        return self._mcp_server_name

    async def execute_tool(
        self,
        tool_name: str,
        parameters: dict[str, Any],
    ) -> str | list[ChatCompletionContentPartParam]:
        result = await self.session.call_tool(tool_name, parameters)
        return convert_to_chat_completion_content_part_param(result)

    async def get_tool(self, tool_name: str, use_cache: bool = True) -> Tool | None:
        if not use_cache:
            response = await self.session.list_tools()
            self.tools = {t.name: t for t in response.tools}
        return self.tools.get(tool_name, None)

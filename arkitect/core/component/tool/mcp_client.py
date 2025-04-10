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

import asyncio
import datetime
import logging
from contextlib import AsyncExitStack
from typing import Any, Dict

from volcenginesdkarkruntime.types.chat import ChatCompletionContentPartParam

from arkitect.core.component.tool.utils import (
    convert_to_chat_completion_content_part_param,
    mcp_to_chat_completion_tool,
)
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ChatCompletionTool
from mcp import (
    ClientSession,
    StdioServerParameters,
    Tool,
    stdio_client,
)
from mcp.client.sse import sse_client
from mcp.client.stdio import get_default_environment

logger = logging.getLogger(__name__)


class MCPClient:
    def __init__(
        self,
        name: str | None = None,
        command: str | None = None,
        arguments: list[str] | None = None,
        server_url: str | None = None,
        env: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 30,
        sse_read_timeout: float = 60 * 5,
        exit_stack: AsyncExitStack | None = None,
    ) -> None:
        self.command = command
        self.arguments = arguments
        self.server_url = server_url
        self.env = env
        self.headers = headers
        self.timeout: float = timeout
        self.sse_read_timeout = sse_read_timeout

        # Initialize session and client objects
        self.session: ClientSession = None  # type: ignore
        self.exit_stack = exit_stack if exit_stack is not None else AsyncExitStack()
        self.tools: Dict[str, Tool] = {}
        self._mcp_server_name: str = name if name is not None else ""
        self._chat_completion_tools: dict[str, ChatCompletionTool] = {}
        self._lock = asyncio.Lock()

    async def connect_to_server(
        self,
    ) -> None:
        """Connect to an MCP server running with SSE or STDIO transport"""
        if self.session is not None:
            logger.warning("MCP client is already connected to server")
            return
        # Store the context managers so they stay alive
        if self.command is not None and self.server_url is not None:
            raise ValueError("You should set either command or server_url")
        if self.server_url is not None:
            await self._connect_to_sse_server()
        elif self.command is not None:
            await self._connect_to_stdio_server()
        else:
            raise ValueError("You should set either command or server_url")
        # Initialize
        await self._init()

    async def _connect_to_stdio_server(self) -> None:
        """Connect to an MCP server"""
        is_python = (
            self.command == "uvx" or self.command == "python" or self.command == "uv"
        )
        is_js = self.command == "npx"
        is_docker = self.command == "docker"
        if not (is_python or is_js or is_docker):
            raise ValueError("Command must be started by uvx, docker or npm.")
        envs = get_default_environment()
        if self.env is not None:
            envs.update(self.env)
        server_params = StdioServerParameters(
            command=self.command,  # type: ignore
            args=self.arguments,  # type: ignore
            env=envs,  # type: ignore
        )

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        stdio_read, stdio_write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(
                stdio_read,
                stdio_write,
                read_timeout_seconds=datetime.timedelta(seconds=self.timeout),
            )
        )

    async def _connect_to_sse_server(
        self,
    ) -> None:
        """Connect to an MCP server running with SSE transport"""
        # Store the context managers so they stay alive
        streams = await self.exit_stack.enter_async_context(
            sse_client(  # type: ignore
                url=self.server_url,  # type: ignore
                headers=self.headers,  # type: ignore
                timeout=self.timeout,  # type: ignore
                sse_read_timeout=self.sse_read_timeout,
            )
        )

        self.session = await self.exit_stack.enter_async_context(
            ClientSession(*streams)
        )

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
        self._mcp_server_name = (
            self.name if self.name != "" else init_result.serverInfo.name
        )

    async def cleanup(self) -> None:
        """Clean up resources"""
        try:
            await self.exit_stack.aclose()
        except asyncio.CancelledError as e:
            logger.error("Error while closing exit stack: %s", e)
            raise e
        except BaseException as e:
            logger.error("Error while closing exit stack: %s", e)
            raise e

    @task()
    async def list_mcp_tools(self, use_cache: bool = True) -> list[Tool]:
        async with self._lock:
            if self.session is None:
                logger.warning(
                    "MCP client is not connected to server yet. Connecting..."
                )
                await self.connect_to_server()
            if not use_cache:
                response = await self.session.list_tools()
                self.tools = {t.name: t for t in response.tools}
            return list(self.tools.values())

    @task()
    async def list_tools(self, use_cache: bool = True) -> list[ChatCompletionTool]:
        async with self._lock:
            if self.session is None:
                logger.warning(
                    "MCP client is not connected to server yet. Connecting..."
                )
                await self.connect_to_server()
            if not use_cache:
                response = await self.session.list_tools()
                self.tools = {t.name: t for t in response.tools}
                self._chat_completion_tools = {
                    t.name: mcp_to_chat_completion_tool(t) for t in response.tools
                }
            return list(self._chat_completion_tools.values())

    @property
    def name(self) -> str:
        return self._mcp_server_name

    @task()
    async def execute_tool(
        self,
        tool_name: str,
        parameters: dict[str, Any],
    ) -> str | list[ChatCompletionContentPartParam]:
        async with self._lock:
            if self.session is None:
                logger.warning(
                    "MCP client is not connected to server yet. Connecting..."
                )
                await self.connect_to_server()
            result = await self.session.call_tool(tool_name, parameters)
            return convert_to_chat_completion_content_part_param(result)

    @task()
    async def get_tool(self, tool_name: str, use_cache: bool = True) -> Tool | None:
        async with self._lock:
            if self.session is None:
                logger.warning(
                    "MCP client is not connected to server yet. Connecting..."
                )
                await self.connect_to_server()
            if not use_cache:
                response = await self.session.list_tools()
                self.tools = {t.name: t for t in response.tools}
            return self.tools.get(tool_name, None)

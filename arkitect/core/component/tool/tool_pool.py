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

from typing import Any, Callable, Dict

from volcenginesdkarkruntime.types.chat import ChatCompletionContentPartParam

from arkitect.core.component.tool.mcp_client import MCPClient
from arkitect.core.component.tool.utils import (
    convert_to_chat_completion_content_part_param,
    find_duplicate_tools,
    mcp_to_chat_completion_tool,
)
from arkitect.telemetry.logger import WARN
from arkitect.telemetry.trace.wrapper import task
from arkitect.types.llm.model import ChatCompletionTool
from mcp.server.fastmcp import FastMCP
from mcp.types import CallToolResult


class ToolPool:
    def __init__(self) -> None:
        self.session: FastMCP = FastMCP()
        self.tools: dict[str, ChatCompletionTool] = {}
        self.mcp_clients: Dict[str, MCPClient] = {}
        self._all_tool_name: set[str] = set()

    def add_mcp_client(self, mcp_client: MCPClient) -> None:
        if mcp_client.name in self.mcp_clients:
            WARN(f"Found MCP client with the same name: {mcp_client.name}. Skipping.")
            return
        self.mcp_clients[mcp_client.name] = mcp_client

    def add_tool(
        self,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
    ) -> None:
        self.session.add_tool(fn=fn, name=name, description=description)

    def tool(
        self, name: str | None = None, description: str | None = None
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        fn = self.session.tool(name=name, description=description)
        return fn

    async def initialize(self) -> None:
        await self.refresh_tool_list()

    @task()
    async def refresh_tool_list(self) -> None:
        tools = await self.session.list_tools()
        self.tools = {t.name: mcp_to_chat_completion_tool(t) for t in tools}
        self._all_tool_name.update([t.name for t in tools])
        for client in self.mcp_clients.values():
            new_tools = await client.list_tools()
            new_names = [t.function.name for t in new_tools]
            self._all_tool_name.update(new_names)

    @task()
    async def list_tools(self, use_cache: bool = True) -> list[ChatCompletionTool]:
        if not use_cache:
            await self.refresh_tool_list()
        chat_completion_tools = list(self.tools.values())
        for client in self.mcp_clients.values():
            chat_completion_tools.extend(await client.list_tools())
        duplicates = find_duplicate_tools(chat_completion_tools)
        if duplicates:
            WARN(
                f"Found tools with the same name in the tool pool: {duplicates}."
                + "This may cause unexpected behavior."
            )
        return chat_completion_tools

    @task()
    async def execute_tool(
        self,
        tool_name: str,
        parameters: dict[str, Any],
    ) -> str | list[ChatCompletionContentPartParam]:
        available_tool_names = [t.name for t in await self.session.list_tools()]
        if tool_name in available_tool_names:
            result = await self.session.call_tool(tool_name, parameters)
            return convert_to_chat_completion_content_part_param(
                CallToolResult(content=list(result), isError=False)
            )
        else:
            for client in self.mcp_clients.values():
                if await client.get_tool(tool_name):
                    return await client.execute_tool(tool_name, parameters)
        raise ValueError(f"Tool {tool_name} is not found!")

    @task()
    async def contain(self, tool_name: str) -> bool:
        return tool_name in self._all_tool_name


def build_tool_pool(
    functions: list[MCPClient | Callable] | ToolPool | None,
) -> ToolPool | None:
    if functions is None:
        return None
    if isinstance(functions, ToolPool):
        return functions
    tool_pool = ToolPool()
    for client_or_callable in functions:
        if isinstance(client_or_callable, MCPClient):
            tool_pool.add_mcp_client(client_or_callable)
        else:
            tool_pool.add_tool(client_or_callable)
    return tool_pool

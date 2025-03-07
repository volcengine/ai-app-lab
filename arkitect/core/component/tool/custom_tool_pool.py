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

from typing import Any, Callable, Dict, Iterable

from mcp import Tool
from mcp.server.fastmcp import FastMCP
from mcp.types import CallToolResult
from volcenginesdkarkruntime.types.chat import ChatCompletionContentPartParam

from arkitect.core.component.tool.mcp_tool_pool import MCPToolPool
from arkitect.core.component.tool.utils import (
    convert_to_chat_completion_content_part_param,
    mcp_to_chat_completion_tool,
)
from arkitect.types.llm.model import ChatCompletionTool


class CustomToolPool(MCPToolPool):
    def __init__(self, name: str | None = None):
        self._name = name if name else "CustomToolPool"
        self.session = FastMCP()
        self.tools: Dict[str, Tool] = {}
        self._chat_completion_tools = {}

    @property
    def name(self) -> str:
        return self._name

    def add_tool(
        self,
        fn: Callable[..., Any],
        name: str | None = None,
        description: str | None = None,
    ) -> None:
        self.session.add_tool(
            func=fn, name=name, description=description, param_description={}
        )

    def tool(
        self, name: str | None = None, description: str | None = None
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        return self.session.tool(name=name, description=description)

    async def connect_to_server(
        self,
        server_url: str | None = None,
        server_script_path: str | None = None,
        env: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 5,
        sse_read_timeout: float = 60 * 5,
    ):
        """Nothing to do"""
        tools = await self.session.list_tools()
        self.tools = {t.name: t for t in tools}
        self._chat_completion_tools = {
            t.name: mcp_to_chat_completion_tool(t) for t in tools
        }

    async def list_mcp_tools(self, use_cache: bool = True) -> list[Tool]:
        if not use_cache:
            tools = await self.session.list_tools()
            self.tools = {t.name: t for t in tools}
        return list(self.tools.values())

    async def list_tools(self, use_cache: bool = True) -> list[ChatCompletionTool]:
        if not use_cache:
            tools = await self.session.list_tools()
            self.tools = {t.name: t for t in tools}
            self._chat_completion_tools = {
                t.name: mcp_to_chat_completion_tool(t) for t in tools
            }
        return list(self._chat_completion_tools.values())

    async def execute_tool(
        self,
        tool_name: str,
        parameters: dict[str, any],
    ) -> str | Iterable[ChatCompletionContentPartParam]:
        result = await self.session.call_tool(tool_name, parameters)

        return convert_to_chat_completion_content_part_param(
            CallToolResult(content=result, isError=False)
        )

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

from typing import Any, Literal, Sequence

from arkitect.telemetry.trace import setup_tracing, task
from mcp.server.fastmcp import FastMCP
from mcp.types import (
    EmbeddedResource,
    ImageContent,
    TextContent,
)
from mcp.types import (
    Tool as MCPTool,
)


class ArkFastMCP(FastMCP):
    def __init__(self, *args, **kwargs):  # type: ignore
        super().__init__(*args, **kwargs)

    def run(  # type: ignore
        self,
        transport: Literal["stdio", "sse", "streamable-http"] = "stdio",
        trace_on: bool = True,
        log_dir: str | None = None,
    ) -> None:
        setup_tracing(trace_on=trace_on, log_dir=log_dir)
        return super().run(transport)

    @task()
    async def list_tools(self) -> list[MCPTool]:
        return await super().list_tools()

    @task()
    async def call_tool(
        self, name: str, arguments: dict[str, Any]
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        return await super().call_tool(name, arguments)

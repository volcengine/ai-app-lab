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

from arkitect.core.component.tool.mcp_tool_pool import MCPToolPool
from dummy_mcp_server import server


async def check_server_working(client: MCPToolPool, use_cache=False):
    assert client.session is not None
    tools = await client.list_tools(use_cache=use_cache)
    assert len(tools) == 2
    assert tools[0].function.name == "adder" and tools[1].function.name == "greeting"
    result = await client.execute_tool("adder", {"a": 1, "b": 2})
    assert result[0] == "3"
    result = await client.execute_tool("greeting", {"name": "John"})
    assert result[0] == "Hello, John!"
    return True



def _start_server():
    """Function to run the server (executed in a separate process)."""
    server.run(transport="sse")


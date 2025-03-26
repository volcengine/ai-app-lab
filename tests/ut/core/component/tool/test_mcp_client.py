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

from arkitect.core.component.tool import MCPClient

import multiprocessing
import time
from utils import check_server_working, _start_server


async def test_connect_to_sse_client():
    # Start server in a separate process
    server_process = multiprocessing.Process(target=_start_server, daemon=True)
    server_process.start()

    # Wait a bit to ensure server starts
    time.sleep(3)

    client = MCPClient(server_url="http://localhost:8000/sse")
    await client.connect_to_server()
    assert await check_server_working(
        client=client,
        expected_tools={
            "adder": {"input": {"a": 1, "b": 2}, "output": "3"},
            "greeting": {"input": {"name": "John"}, "output": "Hello, John!"},
        },
    )
    assert await check_server_working(
        client=client,
        use_cache=True,
        expected_tools={
            "adder": {"input": {"a": 1, "b": 2}, "output": "3"},
            "greeting": {"input": {"name": "John"}, "output": "Hello, John!"},
        },
    )
    await client.cleanup()
    server_process.kill()


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_connect_to_sse_client())

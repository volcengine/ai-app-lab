from arkitect.core.component.tool.mcp_tool_pool import MCPToolPool

import multiprocessing
import time
from utils import check_server_working, _start_server

async def test_connect_to_stdio_client():
    client = MCPToolPool()
    await client.connect_to_server(
        server_script_path="tests/ut/core/component/tool/dummy_mcp_server.py"
    )
    assert await check_server_working(client=client)
    assert await check_server_working(client=client, use_cache=True)
    client._cleanup()



async def test_connect_to_sse_client():
    # Start server in a separate process
    server_process = multiprocessing.Process(target=_start_server, daemon=True)
    server_process.start()

    # Wait a bit to ensure server starts
    time.sleep(5)

    client = MCPToolPool()
    await client.connect_to_server(server_url="http://localhost:8000/sse")
    assert await check_server_working(client=client)
    assert await check_server_working(client=client, use_cache=True)
    client._cleanup()
    server_process.kill()


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_connect_to_stdio_client())
    asyncio.run(test_connect_to_sse_client())

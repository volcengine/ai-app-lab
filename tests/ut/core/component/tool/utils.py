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


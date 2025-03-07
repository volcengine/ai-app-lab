from arkitect.core.component.tool.custom_tool_pool import CustomToolPool
from arkitect.core.component.tool.mcp_tool_pool import MCPToolPool
from utils import check_server_working

async def test_connect_to_stdio_client():
    pool = CustomToolPool()

    @pool.tool()
    async def adder(a: int, b: int) -> int:
        """Add two integer numbers
        Args:
            a (int): first number
            b (int): second number
        Returns:
            int: sum result
        """
        print("calling adder")
        return a + b

    @pool.tool()
    async def greeting(name: str) -> str:
        """Greet a person
        Args:
            name (str): name of the person
        Returns:
            str: greeting message
        """
        return f"Hello, {name}!"

    await pool.connect_to_server()
    await check_server_working(client=pool)
    await check_server_working(client=pool, use_cache=True)


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_connect_to_stdio_client())
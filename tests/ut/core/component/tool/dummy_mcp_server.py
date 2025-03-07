from mcp.server.fastmcp import FastMCP

server = FastMCP()


@server.tool()
async def adder(a: int, b: int) -> int:
    """Add two integer numbers
    Args:
        a (int): first number
        b (int): second number
    Returns:
        int: sum result
    """
    return a + b


@server.tool()
async def greeting(name: str) -> str:
    """Greet a person
    Args:
        name (str): name of the person
    Returns:
        str: greeting message
    """
    return f"Hello, {name}!"


if __name__ == "__main__":
    server.run()

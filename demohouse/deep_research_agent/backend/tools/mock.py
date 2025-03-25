async def add(a: int, b: int) -> int:
    """Add two numbers
    """
    return a + b


async def compare(a: int, b: int) -> int:
    """Compare two numbers, return the bigger one
    """
    return a if a > b else b

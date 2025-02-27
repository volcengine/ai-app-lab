import asyncio
from utils import MCPClient


async def main():
    client = MCPClient()
    try:
        await client.connect_to_server("vdb.py")
        async for chunk in client.chat(model="doubao-1-5-pro-32k-250115"):
            if chunk.choices and chunk.choices[0].delta.content:
                print(chunk.choices[0].delta.content, end="")
    finally:
        await client.cleanup()


if __name__ == "__main__":
    asyncio.run(main())

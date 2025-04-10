from typing import Any, Optional

from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import (
    PostToolCallHook,
    PreToolCallHook,
)
from arkitect.core.component.context.model import State, ToolChunk
from arkitect.core.component.tool.builder import build_mcp_clients_from_config

CONFIG_FILE_PATH = "./mcp_config.json"


class MyHooks(PreToolCallHook, PostToolCallHook):
    async def pre_tool_call(
        self,
        name: str,
        arguments: str,
        state: State,
    ) -> State:
        print("\n" + "=" * 20 + "Inside pre tool call" + "=" * 20 + "\n")
        print(f"Tool {name} with {arguments}")
        # you may modify this or ask users for approval here
        return state  # return state no matter if have modified it

    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        print("\n" + "=" * 20 + "Inside post tool call" + "=" * 20 + "\n")
        print(f"Tool {name} with {arguments} returned {response}")
        return state  # return state no matter if have modified it


class Agent:
    def __init__(self, mcp_config_file: str):
        # Initialize session and client objects
        self.mcp_config_file = mcp_config_file

    async def process_query(self, query: str) -> str:
        mcp_clients, cleanup = build_mcp_clients_from_config(self.mcp_config_file)
        messages = [
            {
                "role": "user",
                "content": query,
            }
        ]

        # Initialize LLM
        ctx = Context(
            model="deepseek-v3-241226",
            tools=list(
                mcp_clients.values()
            ),  # 直接在这个list里传入你的所有的python方法或者MCPClient，可以混着传入
        )
        my_hook = MyHooks()
        ctx.set_pre_tool_call_hook(my_hook)
        ctx.set_post_tool_call_hook(my_hook)
        await ctx.init()

        completion = await ctx.completions.create(messages, stream=True)
        async for resp in completion:
            if isinstance(resp, ToolChunk):
                continue
            print(resp.choices[0].delta.content, end="")
        await cleanup()  # 注意cleanup！！！

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")

        while True:
            try:
                query = input("\nQuery: ").strip()

                if query.lower() == "quit":
                    break

                await self.process_query(query)

            except Exception as e:
                print(f"\nError: {str(e)}")


async def main():
    agent = Agent(mcp_config_file=CONFIG_FILE_PATH)
    await agent.chat_loop()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())

import os
from typing import Any, AsyncIterable, Optional, Union

from volcenginesdkarkruntime.types.chat import ChatCompletion, ChatCompletionChunk

from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import PostToolCallHook, PreToolCallHook
from arkitect.core.component.context.model import State, ToolChunk
from arkitect.core.component.tool.builder import build_mcp_clients_from_config
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)

CONFIG_FILE_PATH = "./mcp_config.json"


def adder(a: int, b: int) -> int:
    """Add two integer numbers

    Args:
        a (int): first number
        b (int): second number

    Returns:
        int: sum result
    """
    print("calling adder")
    return a + b


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

    async def process_query(
        self, request: ArkChatRequest
    ) -> AsyncIterable[ChatCompletionChunk | ToolChunk | ChatCompletion]:
        mcp_clients, cleanup = build_mcp_clients_from_config(self.mcp_config_file)

        messages = [
            {
                "role": msg.role,
                "content": msg.content,
                "tool_call_id": msg.tool_call_id if msg.tool_call_id else None,
            }
            for msg in request.messages
        ]

        # Initialize LLM
        ctx = Context(
            model="deepseek-v3-241226",
            tools=[adder],
            # tools=list(
            #     mcp_clients.values()
            # ),  # 直接在这个list里传入你的所有的python方法或者MCPClient，可以混着传入
        )
        my_hook = MyHooks()
        ctx.set_pre_tool_call_hook(my_hook)
        ctx.set_post_tool_call_hook(my_hook)
        await ctx.init()

        completion = await ctx.completions.create(messages, stream=request.stream)
        if not request.stream:
            yield completion
        async for chunk in completion:
            yield chunk
        await cleanup()


@task()
async def main(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    agent = Agent(mcp_config_file=CONFIG_FILE_PATH)
    stream = agent.process_query(request)
    async for resp in stream:
        if isinstance(resp, ToolChunk):
            continue
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="agent_server",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        trace_on=False,
    )

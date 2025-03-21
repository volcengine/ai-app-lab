# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Any
from arkitect.core.component.tool.builder import build_mcp_clients_from_config
from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import (
    PostToolCallHook,
    PreToolCallHook,
    PreLLMCallHook,
    HookInterruptException,
)
from arkitect.core.component.context.model import State, ContextInterruption
from models.messages import OutputTextChunk, ReasoningChunk


class PreToolCallHookInterrupHook(PreToolCallHook):
    async def pre_tool_call(self, name: str, arguments: str, state: State) -> State:
        print(state.messages)
        return state


class PostToolCallHookInterrupHook(PostToolCallHook):
    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Exception | None,
        state: State,
    ) -> State:
        print(state.messages)
        raise HookInterruptException(
            reason="post tool call interrupt",
            state=state,
        )


class PreLLMCallHookInterrupHook(PreLLMCallHook):
    async def pre_llm_call(self, state: State) -> State:
        print("pre llm call interrupt")
        print(state.messages)
        return state


async def main():
    clients = build_mcp_clients_from_config(
        "/Users/bytedance/Documents/deepresearch/ai-app-lab/demohouse/deep_research_agent/backend/mcp_config.json"
    )

    ctx = Context(
        model="doubao-1.5-pro-32k-250115",
        tools=list(clients.values()),
    )
    await ctx.init()
    ctx.add_post_tool_call_hook(PostToolCallHookInterrupHook())
    ctx.add_pre_tool_call_hook(PreToolCallHookInterrupHook())
    ctx.add_pre_llm_call_hook(PreLLMCallHookInterrupHook())

    resp = await ctx.completions.create(
        [
            {
                "role": "user",
                "content": "https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/src/everart/Dockerfile 这里有什么",
            }
        ],
    )
    async for chunk in resp:
        if isinstance(chunk, ReasoningChunk):
            print(chunk.reasoning_content)
        elif isinstance(chunk, OutputTextChunk):
            print(chunk.content)
        elif isinstance(chunk, ContextInterruption):
            state = chunk.state
            print(state)
            print(chunk.reason)


if __name__ == "__main__":
    import asyncio

    asyncio.get_event_loop().run_until_complete(main())

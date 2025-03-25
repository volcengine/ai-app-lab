# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import copy
import json
from typing import Any, AsyncIterable, Callable, Dict, List, Literal, Optional, Union

from volcenginesdkarkruntime.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionMessageParam,
)
from volcenginesdkarkruntime.types.context import CreateContextResponse

from arkitect.core.client import default_ark_client
from arkitect.core.component.context.hooks import (
    PreToolCallHook,
    PostToolCallHook,
    PreLLMCallHook,
    HookInterruptException,
)
from arkitect.core.component.tool.mcp_client import MCPClient
from arkitect.core.component.tool.tool_pool import ToolPool, build_tool_pool
from arkitect.types.llm.model import (
    ArkChatParameters,
    ArkContextParameters,
)

from .chat_completion import _AsyncChat
from .context_completion import _AsyncContext
from .model import State, ContextInterruption


class _AsyncCompletions:
    def __init__(self, ctx: "Context"):
        self._ctx = ctx
        self.model = ctx.model

    # break loop if return False
    async def handle_tool_call(self) -> bool:
        last_message = self._ctx.get_latest_message()
        if last_message is None or not last_message.get("tool_calls"):
            return True
        if self._ctx.tool_pool is None:
            return False
        for tool_call in last_message.get("tool_calls"):
            tool_name = tool_call.get("function", {}).get("name")
            tool_call_param = copy.deepcopy(tool_call)

            if await self._ctx.tool_pool.contain(tool_name):
                parameters = tool_call_param.get("function", {}).get("arguments", "{}")
                # pre tool call hooks
                for pre_hook in self._ctx.pre_tool_call_hooks:
                    self._ctx.state = await pre_hook.pre_tool_call(
                        tool_name, parameters, self._ctx.state
                    )

                # tool execution
                tool_resp = None
                tool_exception = None
                try:
                    tool_resp = await self._ctx.tool_pool.execute_tool(
                        tool_name=tool_name, parameters=json.loads(parameters)
                    )
                except Exception as e:
                    tool_exception = e

                self._ctx.state.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call_param.get("id", ""),
                        "content": tool_resp if tool_resp else str(tool_exception),
                    }
                )

                # post tool call hooks
                for post_hook in self._ctx.post_tool_call_hooks:
                    self._ctx.state = await post_hook.post_tool_call(
                        tool_name,
                        parameters,
                        tool_resp,
                        tool_exception,
                        self._ctx.state,
                    )
        return True

    async def create(
            self,
            messages: List[ChatCompletionMessageParam],
            stream: Optional[Literal[True, False]] = True,
            **kwargs: Dict[str, Any],
    ) -> Union[
        ChatCompletion | ContextInterruption,
        AsyncIterable[ChatCompletionChunk | ContextInterruption],
    ]:
        self._ctx.state.messages.extend(messages)

        if not stream:
            while True:
                for llm_hook in self._ctx.pre_llm_call_hooks:
                    try:
                        self._ctx.state = await llm_hook.pre_llm_call(self._ctx.state)
                    except HookInterruptException as he:
                        return ContextInterruption(
                            life_cycle="llm_call",
                            reason=he.reason,
                            state=self._ctx.state,
                            details=he.details,
                        )
                resp = (
                    await self._ctx.chat.completions.create(
                        model=self.model,
                        messages=self._ctx.state.messages,
                        stream=stream,
                        tool_pool=self._ctx.tool_pool,
                        **kwargs,
                    )
                    if not self._ctx.state.context_id
                    else await self._ctx.context.completions.create(
                        model=self.model,
                        messages=messages,
                        stream=stream,
                        **kwargs,
                    )
                )
                try:
                    if await self.handle_tool_call():
                        break
                except HookInterruptException as he:
                    return ContextInterruption(
                        life_cycle="tool_call",
                        reason=he.reason,
                        state=self._ctx.state,
                        details=he.details,
                    )
            return resp
        else:

            async def iterator(
                    messages: List[ChatCompletionMessageParam],
            ) -> AsyncIterable[ChatCompletionChunk]:
                while True:
                    try:
                        if not await self.handle_tool_call():
                            break
                    except HookInterruptException as he:
                        yield ContextInterruption(
                            life_cycle="tool_call",
                            reason=he.reason,
                            state=self._ctx.state,
                            details=he.details,
                        )
                        break
                    for llm_hook in self._ctx.pre_llm_call_hooks:
                        try:
                            self._ctx.state = await llm_hook.pre_llm_call(
                                self._ctx.state
                            )
                        except HookInterruptException as he:
                            yield ContextInterruption(
                                life_cycle="llm_call",
                                reason=he.reason,
                                state=self._ctx.state,
                                details=he.details,
                            )
                            return
                    resp = (
                        await self._ctx.chat.completions.create(
                            model=self.model,
                            messages=self._ctx.state.messages,
                            stream=stream,
                            tool_pool=self._ctx.tool_pool,
                            **kwargs,
                        )
                        if not self._ctx.state.context_id
                        else await self._ctx.context.completions.create(
                            model=self.model,
                            messages=messages,
                            stream=stream,
                            **kwargs,
                        )
                    )
                    assert isinstance(resp, AsyncIterable)
                    async for chunk in resp:
                        yield chunk
                        if chunk.choices[0].finish_reason in ['stop', 'length', 'content_filter']:
                            return

            return iterator(messages)


class Context:
    def __init__(
            self,
            *,
            model: str,
            state: State | None = None,
            tools: list[MCPClient | Callable] | ToolPool | None = None,
            parameters: Optional[ArkChatParameters] = None,
            context_parameters: Optional[ArkContextParameters] = None,
    ):
        self.client = default_ark_client()
        self.state = (
            state
            if state
            else State(
                context_id="",
                messages=[],
                parameters=parameters,
                context_parameters=context_parameters,
            )
        )
        self.model = model
        self.chat = _AsyncChat(client=self.client, state=self.state)
        if context_parameters is not None:
            self.context = _AsyncContext(client=self.client, state=self.state)
        self.tool_pool = build_tool_pool(tools)
        self.pre_tool_call_hooks: list[PreToolCallHook] = []
        self.post_tool_call_hooks: list[PostToolCallHook] = []
        self.pre_llm_call_hooks: list[PreLLMCallHook] = []

    async def init(self) -> None:
        if self.state.context_parameters is not None:
            resp: CreateContextResponse = await self.context.create(
                model=self.model,
                mode=self.state.context_parameters.mode,
                messages=self.state.context_parameters.messages,
                ttl=self.state.context_parameters.ttl,
                truncation_strategy=self.state.context_parameters.truncation_strategy,
            )
            self.state.context_id = resp.id
        if self.tool_pool:
            await self.tool_pool.refresh_tool_list()
        return

    def get_latest_message(self) -> Optional[ChatCompletionMessageParam]:
        if len(self.state.messages) == 0:
            return None
        return self.state.messages[-1]

    @property
    def completions(self) -> _AsyncCompletions:
        return _AsyncCompletions(self)

    def add_pre_tool_call_hook(self, hook: PreToolCallHook) -> None:
        self.pre_tool_call_hooks.append(hook)

    def add_post_tool_call_hook(self, hook: PostToolCallHook) -> None:
        self.post_tool_call_hooks.append(hook)

    def add_pre_llm_call_hook(self, hook: PreLLMCallHook) -> None:
        self.pre_llm_call_hooks.append(hook)

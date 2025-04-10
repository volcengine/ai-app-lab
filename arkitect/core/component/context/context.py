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
from typing import (
    Any,
    AsyncIterable,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Union,
)

from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionMessageParam,
)
from volcenginesdkarkruntime.types.context import CreateContextResponse

from arkitect.core.client import default_ark_client
from arkitect.core.component.context.hooks import (
    HookInterruptException,
    PostLLMCallHook,
    PostToolCallHook,
    PreLLMCallHook,
    PreToolCallHook,
)
from arkitect.core.component.tool.mcp_client import MCPClient
from arkitect.core.component.tool.tool_pool import ToolPool, build_tool_pool
from arkitect.types.llm.model import (
    ArkChatParameters,
    ArkContextParameters,
)

from .chat_completion import _AsyncChat
from .context_completion import _AsyncContext
from .model import ContextInterruption, State, ToolChunk


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

            if await self._ctx.tool_pool.contain(tool_name):
                if self._ctx.pre_tool_call_hook:
                    # pre tool call hooks
                    self._ctx.state = await self._ctx.pre_tool_call_hook.pre_tool_call(
                        tool_name,
                        tool_call.get("function", {}).get("arguments", "{}"),
                        self._ctx.state,
                    )
                tool_call_param = copy.deepcopy(tool_call)
                parameters = tool_call_param.get("function", {}).get("arguments", "{}")
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
                if self._ctx.post_tool_call_hook:
                    # post tool call hooks
                    self._ctx.state = (
                        await self._ctx.post_tool_call_hook.post_tool_call(
                            tool_name,
                            parameters,
                            tool_resp,
                            tool_exception,
                            self._ctx.state,
                        )
                    )
        return True

    async def create(
        self,
        messages: List[ChatCompletionMessageParam],
        stream: Optional[Literal[True, False]] = True,
        **kwargs: Dict[str, Any],
    ) -> Union[
        ChatCompletion | ContextInterruption,
        AsyncIterable[ChatCompletionChunk | ContextInterruption | ToolChunk],
    ]:
        self._ctx.state.messages.extend(messages)

        if not stream:
            while True:
                try:
                    if self._ctx.pre_llm_call_hook:
                        self._ctx.state = (
                            await self._ctx.pre_llm_call_hook.pre_llm_call(
                                self._ctx.state
                            )
                        )
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
                    if self._ctx.post_llm_call_hook:
                        self._ctx.state = (
                            await self._ctx.post_llm_call_hook.post_llm_call(
                                self._ctx.state
                            )
                        )
                except HookInterruptException as he:
                    return ContextInterruption(
                        life_cycle="llm_call",
                        reason=he.reason,
                        state=self._ctx.state,
                        details=he.details,
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
            ) -> AsyncIterable[ChatCompletionChunk | ContextInterruption | ToolChunk]:
                if self.need_tool_call():
                    tool_stream = self.create_tool_call_stream()
                    try:
                        async for chunk in tool_stream:
                            yield chunk
                    except HookInterruptException as he:
                        yield ContextInterruption(
                            life_cycle="tool_call",
                            reason=he.reason,
                            state=self._ctx.state,
                            details=he.details,
                        )
                        return

                while True:
                    try:
                        if self._ctx.pre_llm_call_hook:
                            self._ctx.state = (
                                await self._ctx.pre_llm_call_hook.pre_llm_call(
                                    self._ctx.state
                                )
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
                    messages = []

                    try:
                        if self._ctx.post_llm_call_hook:
                            self._ctx.state = (
                                await self._ctx.post_llm_call_hook.post_llm_call(
                                    self._ctx.state
                                )
                            )
                    except HookInterruptException as he:
                        yield ContextInterruption(
                            life_cycle="llm_call",
                            reason=he.reason,
                            state=self._ctx.state,
                            details=he.details,
                        )
                        return

                    if self.need_tool_call():
                        tool_stream = self.create_tool_call_stream()
                        try:
                            async for chunk in tool_stream:
                                yield chunk
                        except HookInterruptException as he:
                            yield ContextInterruption(
                                life_cycle="tool_call",
                                reason=he.reason,
                                state=self._ctx.state,
                                details=he.details,
                            )
                            return
                    else:
                        break

            return iterator(messages)

    async def execute_tool(
        self, tool_name: str, parameters: str
    ) -> tuple[Any | None, Exception | None]:
        tool_resp, tool_exception = None, None
        try:
            tool_resp = await self._ctx.tool_pool.execute_tool(  # type: ignore
                tool_name=tool_name, parameters=json.loads(parameters)
            )
        except Exception as e:
            tool_exception = e
        return tool_resp, tool_exception

    def need_tool_call(self) -> bool:
        last_message = self._ctx.get_latest_message()
        if (
            last_message is not None
            and last_message.get("tool_calls")
            and self._ctx.tool_pool is not None
        ):
            return True
        return False

    def create_tool_call_stream(self) -> AsyncIterable[ToolChunk]:
        async def tool_call_events() -> AsyncIterable[ToolChunk]:
            tool_calls = self._ctx.get_latest_message().get("tool_calls")  # type: ignore
            for tool_call in tool_calls:
                tool_name = tool_call.get("function", {}).get("name")
                arguments = tool_call.get("function", {}).get("arguments", "{}")
                if self._ctx.pre_tool_call_hook:
                    self._ctx.state = await self._ctx.pre_tool_call_hook.pre_tool_call(
                        tool_name,
                        arguments,
                        self._ctx.state,
                    )
                updated_arguments = tool_call.get("function", {}).get("arguments", "{}")

                yield ToolChunk(
                    tool_call_id=tool_call.get("id", ""),
                    tool_name=tool_name,
                    tool_arguments=updated_arguments,
                )
                resp, exceptions = await self.execute_tool(tool_name, updated_arguments)
                yield ToolChunk(
                    tool_call_id=tool_call.get("id", ""),
                    tool_name=tool_name,
                    tool_arguments=updated_arguments,
                    tool_exception=exceptions,
                    tool_response=resp,
                )
                self._ctx.state.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.get("id", ""),
                        "content": resp,
                    }
                )
                if self._ctx.post_tool_call_hook:
                    self._ctx.state = (
                        await self._ctx.post_tool_call_hook.post_tool_call(
                            name=tool_name,
                            arguments=arguments,
                            response=resp,
                            exception=exceptions,
                            state=self._ctx.state,
                        )
                    )

        return tool_call_events()


class Context:
    def __init__(
        self,
        *,
        model: str,
        state: State | None = None,
        tools: list[MCPClient | Callable] | ToolPool | None = None,
        parameters: Optional[ArkChatParameters] = None,
        context_parameters: Optional[ArkContextParameters] = None,
        client: Optional[AsyncArk] = None,
    ):
        self.client = default_ark_client() if client is None else client
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
        self.pre_tool_call_hook: PreToolCallHook | None = None
        self.post_tool_call_hook: PostToolCallHook | None = None
        self.pre_llm_call_hook: PreLLMCallHook | None = None
        self.post_llm_call_hook: PostLLMCallHook | None = None

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

    def get_latest_message(
        self, role: str = "assistant"
    ) -> Optional[ChatCompletionMessageParam]:
        return self.state.messages[-1]

    @property
    def completions(self) -> _AsyncCompletions:
        return _AsyncCompletions(self)

    def set_pre_tool_call_hook(self, hook: PreToolCallHook) -> None:
        self.pre_tool_call_hook = hook

    def set_post_tool_call_hook(self, hook: PostToolCallHook) -> None:
        self.post_tool_call_hook = hook

    def set_pre_llm_call_hook(self, hook: PreLLMCallHook) -> None:
        self.pre_llm_call_hook = hook

    def set_post_llm_call_hook(self, hook: PostLLMCallHook) -> None:
        self.post_llm_call_hook = hook

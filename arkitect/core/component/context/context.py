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

from typing import Any, AsyncIterable, Dict, List, Literal, Optional, Union

from volcenginesdkarkruntime.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionMessageParam,
)
from volcenginesdkarkruntime.types.context import CreateContextResponse

from arkitect.core.client import default_ark_client
from arkitect.core.component.llm.model import (
    ArkChatParameters,
    ArkContextParameters,
)
from arkitect.core.component.tool.pool import ToolManifest

from .chat_completion import _AsyncChat
from .context_completion import _AsyncContext
from .model import State
from .tool import _AsyncTool


class _AsyncCompletions:
    def __init__(self, ctx: "Context"):
        self._ctx = ctx

    async def handle_tool_call(self) -> bool:
        last_message = self._ctx.get_latest_message()
        if last_message is None or not last_message.get("tool_calls"):
            return True
        for tool_call in last_message.get("tool_calls"):
            tool = self._ctx.tools.get(tool_call.get("function", {}).get("name"))
            if tool is None:
                continue
            await tool.execute(parameter=tool_call)
        return False

    async def create(
        self,
        messages: List[ChatCompletionMessageParam],
        stream: Optional[Literal[True, False]] = True,
        **kwargs: Dict[str, Any],
    ) -> Union[ChatCompletion, AsyncIterable[ChatCompletionChunk]]:
        if not stream:
            while True:
                resp = (
                    await self._ctx.chat.completions.create(
                        messages=messages,
                        stream=stream,
                        tools=self._ctx.tools,
                        **kwargs,
                    )
                    if not self._ctx.state.context_id
                    else await self._ctx.context.completions.create(
                        messages=messages,
                        stream=stream,
                        **kwargs,
                    )
                )
                messages = []
                if await self.handle_tool_call():
                    break
            return resp
        else:

            async def iterator(
                messages: List[ChatCompletionMessageParam],
            ) -> AsyncIterable[ChatCompletionChunk]:
                while True:
                    resp = (
                        await self._ctx.chat.completions.create(
                            messages=messages,
                            stream=stream,
                            tools=self._ctx.tools,
                            **kwargs,
                        )
                        if not self._ctx.state.context_id
                        else await self._ctx.context.completions.create(
                            messages=messages,
                            stream=stream,
                            **kwargs,
                        )
                    )
                    assert isinstance(resp, AsyncIterable)
                    async for chunk in resp:
                        yield chunk
                    messages = []
                    if await self.handle_tool_call():
                        break

            return iterator(messages)


class Context:
    def __init__(
        self,
        *,
        model: str,
        tools: Dict[str, ToolManifest] = {},
        parameters: Optional[ArkChatParameters] = None,
        context_parameters: Optional[ArkContextParameters] = None,
    ):
        self.client = default_ark_client()
        self.state = State(
            model=model,
            context_id="",
            messages=[],
            parameters=parameters,
            context_parameters=context_parameters,
        )
        self.chat = _AsyncChat(client=self.client, state=self.state)
        if context_parameters is not None:
            self.context = _AsyncContext(client=self.client, state=self.state)
        self.tools = {
            tool_name: _AsyncTool(
                state=self.state,
                tool=tool,
            )
            for tool_name, tool in tools.items()
        }

    async def __aenter__(self) -> "Context":
        if self.state.context_parameters is not None:
            resp: CreateContextResponse = await self.context.create(
                model=self.state.model,
                mode=self.state.context_parameters.mode,
                messages=self.state.context_parameters.messages,
                ttl=self.state.context_parameters.ttl,
                truncation_strategy=self.state.context_parameters.truncation_strategy,
            )
            self.state.context_id = resp.id
        return self

    async def __aexit__(
        self,
        exc_type: Optional[type[BaseException]],
        exc_value: Optional[BaseException],
        exc_tb: object,
    ) -> None:
        # context is currently removed when expire
        # do not need explicit deletion
        pass

    def get_latest_message(self) -> Optional[ChatCompletionMessageParam]:
        if len(self.state.messages) == 0:
            return None
        return self.state.messages[-1]

    @property
    def completions(self) -> _AsyncCompletions:
        return _AsyncCompletions(self)

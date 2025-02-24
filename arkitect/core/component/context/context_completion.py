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

from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.resources.context import AsyncContext
from volcenginesdkarkruntime.resources.context.completions import AsyncCompletions
from volcenginesdkarkruntime.types.chat import (
    ChatCompletionMessageParam,
)
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)
from volcenginesdkarkruntime.types.context import (
    ContextChatCompletion,
    ContextChatCompletionChunk,
)

from .hooks import ChatHook, default_chat_hook, default_context_chat_hook
from .model import State


class _AsyncCompletions(AsyncCompletions):
    def __init__(self, client: AsyncArk, state: State, hooks: List[ChatHook]):
        self._state = state
        if len(hooks) > 0:
            self.hooks = hooks
        elif state.context_parameters and state.context_parameters.mode == "session":
            self.hooks = [default_context_chat_hook]
        else:
            # for prefix cache
            self.hooks = [default_chat_hook]
        super().__init__(client)

    async def create(
        self,
        messages: List[ChatCompletionMessageParam],
        stream: Optional[Literal[False, True]] = True,
        **kwargs: Dict[str, Any],
    ) -> Union[ContextChatCompletion, AsyncIterable[ContextChatCompletionChunk]]:
        parameters = (
            self._state.parameters.__dict__
            if self._state.parameters is not None
            else {}
        )
        for hook in self.hooks:
            messages = await hook(self._state, messages)
        resp = await super().create(
            model=self._state.model,
            context_id=self._state.context_id,
            messages=messages,
            stream=stream,
            **parameters,
            **kwargs,
        )
        if not stream:
            if resp.choices:
                self._state.messages.append(resp.choices[0].message.__dict__)
            return resp
        else:

            async def iterator() -> AsyncIterable[ContextChatCompletionChunk]:
                chat_completion_messages = ChatCompletionMessage(
                    role="assistant",
                    content="",
                    tool_calls=None,
                )
                async for chunk in resp:
                    if len(chunk.choices) > 0:
                        if chunk.choices[0].delta.content:
                            chat_completion_messages.content += chunk.choices[
                                0
                            ].delta.content
                    yield chunk
                self._state.messages.append(chat_completion_messages.__dict__)

            return iterator()


class _AsyncContext(AsyncContext):
    def __init__(self, client: AsyncArk, state: State, hooks: List[ChatHook] = []):
        self._state = state
        self.hooks = hooks
        super().__init__(client)

    @property
    def completions(self) -> _AsyncCompletions:
        return _AsyncCompletions(self._client, self._state, self.hooks)

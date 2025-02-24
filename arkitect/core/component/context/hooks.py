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

from typing import Awaitable, Callable, List

from volcenginesdkarkruntime.types.chat import ChatCompletionMessageParam

from arkitect.core.component.llm.model import (
    ChatCompletionMessageToolCallParam,
)

from .model import State

ChatHook = Callable[
    [State, List[ChatCompletionMessageParam]],
    Awaitable[List[ChatCompletionMessageParam]],
]
ToolHook = Callable[
    [State, ChatCompletionMessageToolCallParam],
    Awaitable[ChatCompletionMessageToolCallParam],
]


async def default_chat_hook(
    state: State, messages: List[ChatCompletionMessageParam]
) -> List[ChatCompletionMessageParam]:
    state.messages.extend(messages)
    messages = state.messages
    return messages


async def default_context_chat_hook(
    state: State, messages: List[ChatCompletionMessageParam]
) -> List[ChatCompletionMessageParam]:
    state.messages.extend(messages)
    return messages


async def approval_tool_hook(
    state: State, parameter: ChatCompletionMessageToolCallParam
) -> ChatCompletionMessageToolCallParam:
    print(parameter)
    y_or_n = input("input Y to approve\n")
    if y_or_n == "Y":
        return parameter
    else:
        raise ValueError("tool call parameters not approved")

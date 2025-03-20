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

from arkitect.types.llm.model import (
    ChatCompletionMessageToolCallParam,
)

from .model import State

Hook = Callable[
    [State],
    Awaitable[State],
]


async def approval_tool_hook(state: State) -> State:
    if len(state.messages) == 0:
        return state
    last_message = state.messages[-1]
    if not last_message.get("tool_calls"):
        return state

    formated_output = []
    for tool_call in last_message.get("tool_calls"):
        tool_name = tool_call.get("function", {}).get("name")
        tool_call_param = tool_call.get("function", {}).get("arguments", "{}")
        formated_output.append(
            f"tool_name: {tool_name}\ntool_call_param: {tool_call_param}\n"
        )
    print("tool call parameters:")
    print("".join(formated_output))
    y_or_n = input("input Y to approve\n")
    if y_or_n == "Y":
        return state
    else:
        raise ValueError("tool call parameters not approved")

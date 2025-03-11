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
from typing import Any, Optional, Union

from volcenginesdkarkruntime.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
)

from arkitect.core.component.tool.tool_pool import ToolPool
from arkitect.telemetry.logger import INFO, WARN
from arkitect.telemetry.trace import task
from arkitect.utils import dump_json_str

from ....types.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
    FunctionCallMode,
)
from .utils import convert_response_message


@task()
async def handle_function_call(
    request: ArkChatRequest,
    response: Union[
        ChatCompletionChunk, ChatCompletion, ArkChatCompletionChunk, ArkChatResponse
    ],
    tool_pool: Optional[ToolPool] = None,
    function_call_mode: Optional[FunctionCallMode] = FunctionCallMode.SEQUENTIAL,
    **kwargs: Any,
) -> bool:
    """
    Handles function calls in a chat response.

    This function processes a chat response and checks if it contains a function call.
    If it does, it executes the function and appends the result to the request messages.

    Args:
        request : The original chat request.
        response : The chat response to process.
        functions : A dictionary of available functions.
        function_call_mode : The mode for handling function calls.
    """
    if response.choices[0].finish_reason != "tool_calls":
        return False

    response_message = (
        response.choices[0].delta
        if isinstance(response, ChatCompletionChunk)
        or isinstance(response, ArkChatCompletionChunk)
        else response.choices[0].message
    )
    tool_calls = response_message.tool_calls

    if not tool_calls or not tool_pool:
        return False

    if function_call_mode and function_call_mode != FunctionCallMode.SEQUENTIAL:
        raise NotImplementedError("Only sequential function call mode is supported")

    request.messages.append(convert_response_message(response_message))

    function_calls = copy.deepcopy(tool_calls)
    for tool_call in function_calls:
        tool_name = tool_call.function.name
        parameters = json.loads(tool_call.function.arguments)
        if not await tool_pool.contain(tool_name=tool_name):
            WARN(f"Function {tool_name} not found")
        else:
            resp = await tool_pool.execute_tool(
                tool_name=tool_name,
                parameters=parameters,
            )
            INFO(
                f"Function {tool_name} called with parameters:"
                + dump_json_str(parameters)
                + f" and response: {resp}"
            )
            request.messages.append(
                ArkMessage(
                    role="tool",
                    content=resp,
                    tool_call_id=tool_call.id,
                )
            )
    return True

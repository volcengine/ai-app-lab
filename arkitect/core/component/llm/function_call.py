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
import logging
from typing import Any, Dict, Optional, Union

from volcenginesdkarkruntime.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
)

from arkitect.core.component.tool import BaseTool, BaseToolResponse
from arkitect.telemetry.trace import task
from arkitect.utils import dump_json_str

from .model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
    FunctionCallMode,
)
from .utils import convert_response_message, transform_response


@task()
async def handle_function_call(
    request: ArkChatRequest,
    response: Union[
        ChatCompletionChunk, ChatCompletion, ArkChatCompletionChunk, ArkChatResponse
    ],
    functions: Optional[Dict[str, BaseTool]] = None,
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

    if not tool_calls or not functions:
        return False

    if function_call_mode and function_call_mode != FunctionCallMode.SEQUENTIAL:
        raise NotImplementedError("Only sequential function call mode is supported")

    request.messages.append(convert_response_message(response_message))

    function_calls = copy.deepcopy(tool_calls)
    for tool_call in function_calls:
        tool_name = tool_call.function.name

        tool = functions.get(tool_name)
        resp = None
        if tool is None:
            logging.error(f"Function {tool_name} not found")
            resp = ""
        else:
            tool_response: BaseToolResponse = BaseToolResponse()
            parameters = json.loads(tool_call.function.arguments)
            tool_response = await tool.execute(parameters=parameters, **kwargs)
            logging.info(
                f"Function {tool_name} called with parameters:"
                + dump_json_str(parameters)
                + f" and response: {dump_json_str(tool_response)}"
            )
            resp = tool_response.data

        request.messages.append(
            ArkMessage(
                role="tool",
                content=transform_response(resp),
                tool_call_id=tool_call.id,
            )
        )
    return True

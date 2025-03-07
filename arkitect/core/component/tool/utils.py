# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Iterable

from mcp import Tool
from mcp.types import CallToolResult, TextContent
from volcenginesdkarkruntime.types.chat import ChatCompletionContentPartParam

from arkitect.types.llm.model import ChatCompletionTool, FunctionDefinition


def convert_to_chat_completion_content_part_param(
    result: CallToolResult,
) -> str | Iterable[ChatCompletionContentPartParam]:
    if len(result.content) == 1 and isinstance(result.content[0], TextContent):
        return result.content[0].text
    message_parts = []
    for part in result.content:
        if isinstance(part, TextContent):
            message_parts.append(part.text)
        else:
            raise NotImplementedError("Non-text tool response not supported")
    return message_parts


def convert_schema(
    input_shema: dict[str, any], param_descriptions: dict[str, str] = {}
) -> dict[str, any]:
    properties = input_shema["properties"]
    for key, val in properties.items():
        if "description" not in val:
            val["description"] = param_descriptions.get(key, "")
        properties[key] = val
    return input_shema


def mcp_to_chat_completion_tool(
    mcp_tool: Tool, param_descriptions: dict[str, str] = {}
) -> ChatCompletionTool:
    t = ChatCompletionTool(
        type="function",
        function=FunctionDefinition(
            name=mcp_tool.name,
            description=mcp_tool.description,
            parameters=convert_schema(mcp_tool.inputSchema, param_descriptions),
        ),
    )
    return t

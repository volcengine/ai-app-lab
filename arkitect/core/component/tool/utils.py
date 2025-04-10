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

from typing import Any

from volcenginesdkarkruntime.types.chat import (
    ChatCompletionContentPartParam,
    ChatCompletionContentPartTextParam,
)
from volcenginesdkarkruntime.types.chat.chat_completion_content_part_image_param import (  # noqa: E501
    ChatCompletionContentPartImageParam,
    ImageURL,
)

from arkitect.types.llm.model import ChatCompletionTool, FunctionDefinition
from mcp import Tool
from mcp.types import CallToolResult, ImageContent, TextContent


def convert_to_chat_completion_content_part_param(
    result: CallToolResult,
) -> str | list[ChatCompletionContentPartParam]:
    if len(result.content) == 1 and isinstance(result.content[0], TextContent):
        return result.content[0].text
    message_parts = []
    for part in result.content:
        if isinstance(part, TextContent):
            message_parts.append(convert_to_text_param(part))
        elif isinstance(part, ImageContent):
            message_parts.append(convert_to_image_param(part))
        else:
            raise NotImplementedError("Only text/image tool response are supported now")
    return message_parts


def convert_to_text_param(
    text_content: TextContent,
) -> ChatCompletionContentPartTextParam:
    return ChatCompletionContentPartTextParam(
        type="text",
        text=text_content.text,
    )


def convert_to_image_param(
    image_content: ImageContent,
) -> ChatCompletionContentPartImageParam:
    data_url = f"data:{image_content.mimeType};base64,{image_content.data}"
    return ChatCompletionContentPartImageParam(
        type="image_url",
        image_url=ImageURL(
            url=data_url,
            detail="auto",
        ),
    )


def convert_schema(
    input_shema: dict[str, Any], param_descriptions: dict[str, str] = {}
) -> dict[str, Any]:
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
            description=mcp_tool.description if mcp_tool.description else "",
            parameters=convert_schema(mcp_tool.inputSchema, param_descriptions),
        ),
    )
    return t


def find_duplicate_tools(
    tools: list[ChatCompletionTool],
) -> list[str]:
    seen = set()
    duplicates = []
    for tool in tools:
        if tool.function.name in seen:
            duplicates.append(tool.function.name)
        else:
            seen.add(tool.function.name)
    return duplicates

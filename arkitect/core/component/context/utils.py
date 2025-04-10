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

from typing import Union

from volcenginesdkarkruntime.types.chat import ChatCompletion, ChatCompletionChunk

from arkitect.core.component.context.model import ToolChunk
from arkitect.telemetry import logger
from arkitect.types.llm.model import (
    ActionDetail,
    ArkChatCompletionChunk,
    ArkChatResponse,
    BotUsage,
    ToolDetail,
)


def convert_chunk(
    chunk: Union[ChatCompletionChunk, ToolChunk, ChatCompletion],
) -> ArkChatCompletionChunk | ArkChatResponse | None:
    if isinstance(chunk, ChatCompletionChunk):
        return ArkChatCompletionChunk(**chunk.model_dump())
    elif isinstance(chunk, ToolChunk):
        if chunk.tool_response:
            return ArkChatCompletionChunk(
                id="",
                choices=[],
                created=0,
                model="",
                references=[],
                bot_usage=BotUsage(
                    action_details=[
                        ActionDetail(
                            name=chunk.tool_name,
                            tool_details=[
                                ToolDetail(
                                    name=chunk.tool_name,
                                    input=chunk.tool_arguments,
                                    output=chunk.tool_response,
                                )
                            ],
                        )
                    ]
                ),
                object="chat.completion.chunk",
            )
        else:
            logger.INFO(
                f"Calling tool {chunk.tool_name} with {chunk.tool_arguments}..."
            )
    elif isinstance(chunk, ChatCompletion):
        return ArkChatResponse(**chunk.model_dump())
    return None

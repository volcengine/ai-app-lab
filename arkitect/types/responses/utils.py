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

# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from arkitect.core.errors.exceptions import APIException
from arkitect.types.llm.model import (
    ActionDetail,
    ArkChatCompletionChunk,
    BotUsage,
    ToolDetail,
)
from arkitect.types.responses.event import (
    BaseEvent,
    ErrorEvent,
    OutputTextEvent,
    ReasoningEvent,
    ToolCallEvent,
    ToolChunk,
    ToolCompletedEvent,
)


def convert_chat_to_event(chat_chunk: ChatCompletionChunk) -> BaseEvent | None:
    if chat_chunk.choices and chat_chunk.choices[0].delta:
        delta = chat_chunk.choices[0].delta
        if delta.content:
            return OutputTextEvent(
                id=chat_chunk.id,
                delta=delta.content,
            )
        elif delta.reasoning_content:
            return ReasoningEvent(
                id=chat_chunk.id,
                delta=delta.reasoning_content,
            )
    return None


def convert_tool_chunk_to_event(chunk: ToolChunk) -> BaseEvent:
    if chunk.tool_response:
        return ToolCompletedEvent(
            tool_call_id=chunk.tool_call_id,
            tool_name=chunk.tool_name,
            tool_arguments=chunk.tool_arguments,
            tool_response=chunk.tool_response,
        )
    return ToolCallEvent(
        tool_call_id=chunk.tool_call_id,
        tool_name=chunk.tool_name,
        tool_arguments=chunk.tool_arguments,
    )


def event_to_ark_chat_completion_chunks(event: BaseEvent) -> ArkChatCompletionChunk:
    if isinstance(event, OutputTextEvent):
        return ArkChatCompletionChunk(
            id=event.id,
            choices=[
                completion_chunk.Choice(
                    delta=completion_chunk.ChoiceDelta(
                        content=event.delta,
                        role="assistant",
                    ),
                    index=0,
                )
            ],
            created=0,
            model="default",
            object="chat.completion.chunk",
        )
    elif isinstance(event, ReasoningEvent):
        return ArkChatCompletionChunk(
            id=event.id,
            choices=[
                completion_chunk.Choice(
                    delta=completion_chunk.ChoiceDelta(
                        reasoning_content=event.delta,
                        role="assistant",
                    ),
                    index=0,
                )
            ],
            created=0,
            model="default",
            object="chat.completion.chunk",
        )
    elif isinstance(event, ToolCompletedEvent):
        return ArkChatCompletionChunk(
            id=event.id,
            choices=[],
            created=0,
            model="default",
            object="chat.completion.chunk",
            bot_usage=BotUsage(
                action_details=[
                    ActionDetail(
                        name=event.tool_name,
                        tool_details=[
                            ToolDetail(
                                name=event.tool_name,
                                input=event.tool_arguments,
                                output=event.tool_response,
                            )
                        ],
                    )
                ]
            ),
        )
    elif isinstance(event, ToolCallEvent):
        return ArkChatCompletionChunk(
            id=event.id,
            choices=[],
            created=0,
            model="default",
            object="chat.completion.chunk",
            bot_usage=BotUsage(
                action_details=[
                    ActionDetail(
                        name=event.tool_name,
                        tool_details=[
                            ToolDetail(
                                name=event.tool_name,
                                input=event.tool_arguments,
                                output=None,
                            )
                        ],
                    )
                ]
            ),
        )
    elif isinstance(event, ErrorEvent):
        if event.exception:
            raise event.exception
        else:
            raise APIException(message=event.error_msg, code=event.error_code)

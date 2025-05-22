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

from openai.types.responses import Response
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)

from arkitect.types.llm.model import Message


def _ark_message_to_string(messages: list[Message | dict]) -> str:
    content = ""
    for message in messages:
        if isinstance(message, Message):
            content += f"{message.role}: {message.content}\n"
        elif isinstance(message, dict):
            content += f"{message['role']}: {message['content']}\n"
    return content


def format_message_as_string(
    message: Message | dict | Response | ChatCompletionMessage,
) -> str:
    if isinstance(message, Message):
        return f"{message.role}: {message.content}\n"
    elif isinstance(message, dict):
        return f"{message['role']}: {message['content']}\n"
    elif isinstance(message, Response):
        return f"assistant: {message.output_text}"
    elif isinstance(message, ChatCompletionMessage):
        return f"assistant: {message.content}"
    else:
        raise ValueError("Invalid message type")


def format_message_as_dict(
    message: Message | dict | Response | ChatCompletionMessage,
) -> dict:
    if isinstance(message, Message):
        return message.model_dump()
    elif isinstance(message, dict):
        return message
    elif isinstance(message, Response):
        return {"role": "assistant", "content": message.output_text}
    elif isinstance(message, ChatCompletionMessage):
        return {"role": "assistant", "content": message.content}
    else:
        raise ValueError("Invalid message type")

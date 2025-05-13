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

from arkitect.types.llm.model import ArkMessage


def _ark_message_to_string(messages: list[ArkMessage | dict]) -> str:
    content = ""
    for message in messages:
        if isinstance(message, ArkMessage):
            content += f"{message.role}: {message.content}\n"
        elif isinstance(message, dict):
            content += f"{message['role']}: {message['content']}\n"
    return content


def get_user_input_str(user_input: list[ArkMessage | dict]) -> str:
    return _ark_message_to_string(user_input)


def get_response_str(assistant_response: Response | ChatCompletionMessage) -> str:
    if isinstance(assistant_response, Response):
        return assistant_response.choices[0].message.content
    elif isinstance(assistant_response, ChatCompletionMessage):
        return assistant_response.content
    else:
        raise ValueError("Invalid assistant response type")

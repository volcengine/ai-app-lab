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
from typing import Any, Optional

from pydantic import BaseModel

from arkitect.types.llm.model import ArkMessage


class ToolChunk(BaseModel):
    tool_call_id: str
    tool_name: str
    tool_arguments: str
    tool_exception: Optional[Exception] = None
    tool_response: Any | None = None

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


class BaseEvent(BaseModel):
    id: str = ""

    author: str = ""
    session_id: Optional[str] = ""

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


"""
Errors
"""


class ErrorEvent(BaseEvent):
    exception: BaseException | None = None
    error_code: str = ""
    error_msg: str = ""


class InvalidParameter(ErrorEvent):
    parameter: str = ""
    error_code: str = "InvalidParameter"
    error_msg: str = "the specific parameter is invalid"


class InternalServiceError(ErrorEvent):
    error_code: str = "InternalServiceError"


"""
Messages
"""


class MessageEvent(BaseEvent):
    delta: str | None = None


class OutputTextEvent(MessageEvent):
    pass


class ReasoningEvent(MessageEvent):
    pass


"""
Tool-Using
"""


class ToolCallEvent(BaseEvent):
    tool_call_id: str = ""
    tool_name: str = ""
    tool_arguments: str


class ToolCompletedEvent(ToolCallEvent):
    tool_exception: Optional[Exception] = None
    tool_response: Any | None = None


"""
Control event
"""


class EOFEvent(BaseEvent):
    pass


class StateUpdateEvent(BaseEvent):
    details_delta: dict | None = None
    message_delta: list[ArkMessage] | None = None

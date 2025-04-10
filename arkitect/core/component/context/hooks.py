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
import abc
from typing import Any, Optional, Union

from .model import State


class HookInterruptException(Exception):
    def __init__(
        self,
        reason: str,
        state: Optional[State] = None,
        details: Optional[Any] = None,
    ):
        self.reason = reason
        self.state = state
        self.details = details


class PreToolCallHook(abc.ABC):
    @abc.abstractmethod
    async def pre_tool_call(
        self,
        name: str,
        arguments: str,
        state: State,
    ) -> State:
        pass


class PostToolCallHook(abc.ABC):
    @abc.abstractmethod
    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        pass


class PreLLMCallHook(abc.ABC):
    @abc.abstractmethod
    async def pre_llm_call(
        self,
        state: State,
    ) -> State:
        pass


class PostLLMCallHook(abc.ABC):
    @abc.abstractmethod
    async def post_llm_call(
        self,
        state: State,
    ) -> State:
        pass


Hook = Union[
    PreToolCallHook,
    PostToolCallHook,
    PreLLMCallHook,
]


class ApprovalHook(PreToolCallHook):
    async def pre_tool_call(
        self,
        name: str,
        arguments: str,
        state: State,
    ) -> State:
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
            raise HookInterruptException(reason="approval failed", state=state)

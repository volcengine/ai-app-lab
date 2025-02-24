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

import json
from typing import Any, List

from pydantic import BaseModel, Field
from volcenginesdkarkruntime.types.chat import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
)

from arkitect.core.component.context.hooks import ToolHook
from arkitect.core.component.context.model import State
from arkitect.core.component.llm.model import ChatCompletionTool, FunctionDefinition
from arkitect.core.component.tool import ArkToolResponse, ToolManifest


class _AsyncTool(BaseModel):
    state: State
    hooks: List[ToolHook] = Field(default_factory=list)
    tool: ToolManifest

    async def execute(
        self, parameter: ChatCompletionAssistantMessageParam, **kwargs: Any
    ) -> ChatCompletionMessageParam:
        for hook in self.hooks:
            parameter = await hook(self.state, parameter)
        arguments = parameter.get("function", {}).get("arguments", "{}")
        resp = await self.tool.executor(json.loads(arguments), **kwargs)
        if isinstance(resp, ChatCompletionMessageParam):
            self.state.messages.append(resp)
        elif isinstance(resp, ArkToolResponse):
            self.state.messages.append(
                {
                    "role": "tool",
                    "tool_call_id": parameter.get("id", ""),
                    "content": resp.model_dump_json(),
                }
            )
        return self.state.messages[-1]

    def tool_schema(self) -> ChatCompletionTool:
        """
        Returns the schema of the tool.
        """
        return ChatCompletionTool(
            type="function", function=FunctionDefinition(**self.tool.manifest())
        )

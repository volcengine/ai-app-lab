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

from pydantic import Field

from arkitect.core.component.context.hooks import ToolHook
from arkitect.core.component.context.model import State
from arkitect.core.component.llm.model import (
    ArkMessage,
    ChatCompletionMessageToolCallParam,
)
from arkitect.core.component.tool import ArkToolResponse, ToolManifest


class _AsyncTool(ToolManifest):
    state: State
    hooks: List[ToolHook] = Field(default_factory=list)

    async def execute(
        self, parameter: ChatCompletionMessageToolCallParam, **kwargs: Any
    ) -> ArkToolResponse:
        for hook in self.hooks:
            parameter = await hook(self.state, parameter)
        resp = await super().executor(
            json.loads(parameter.function.arguments), **kwargs
        )
        self.state.messages.append(
            ArkMessage(
                role="tool", tool_call_id=parameter.id, content=resp.model_dump_json()
            )
        )
        return resp

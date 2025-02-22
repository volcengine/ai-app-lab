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

from typing import List, Optional, TypeVar

from pydantic import BaseModel, Field

from arkitect.core.component.llm.model import (
    ArkChatParameters,
    ArkContextParameters,
    ArkMessage,
)
from arkitect.core.component.tool import ToolManifest

ToolType = TypeVar("ToolType", bound=ToolManifest)


class State(BaseModel):
    model: str
    context_id: Optional[str] = Field(default=None)
    messages: List[ArkMessage] = Field(default_factory=list)
    parameters: Optional[ArkChatParameters] = Field(default=None)
    context_parameters: Optional[ArkContextParameters] = Field(default=None)

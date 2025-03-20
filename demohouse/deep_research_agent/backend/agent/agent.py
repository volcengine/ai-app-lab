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

import abc
from typing import AsyncIterable, Union, List, Callable

from pydantic import BaseModel

from arkitect.core.component.tool import MCPClient
from models.messages import MessageChunk
from models.planning import PlanningItem
from models.tool_events import ToolCompletedEvent, ToolCallEvent

AgentStepChunk = MessageChunk | ToolCallEvent | ToolCompletedEvent

"""
Agent is the core interface for all runnable agents
"""


class Agent(abc.ABC, BaseModel):
    llm_model: str = ""
    instruction: str = ""
    tools: List[Union[MCPClient | Callable]] = []

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    # stream run step
    @abc.abstractmethod
    async def astream_step(
            self,
            **kwargs
    ) -> AsyncIterable[AgentStepChunk]:
        pass

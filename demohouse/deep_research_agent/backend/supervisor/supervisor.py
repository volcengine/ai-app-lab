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
from typing import Dict, Union, AsyncIterable

from openai import BaseModel
from pydantic import Field

from agent.agent import AgentTemplate
from models.messages import MessageChunk
from models.tool_events import AssignTodoToolCompletedEvent
from models.planning import Planning, PlanningItem


class Supervisor(abc.ABC, BaseModel):
    planning: Planning = Field(default_factory=None)
    worker_agents: Dict[str, AgentTemplate] = {}
    llm_model: str = ''

    @abc.abstractmethod
    async def astream_assign_next_todo(self, **kwargs) -> AsyncIterable[
        Union[MessageChunk, AssignTodoToolCompletedEvent]
    ]:
        pass

    @abc.abstractmethod
    async def receive_step(self, planning_item: PlanningItem) -> AsyncIterable[MessageChunk]:
        pass

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
from typing import AsyncIterable, Callable, Union
from pydantic import BaseModel

from arkitect.core.component.tool import MCPClient
from arkitect.core.component.context.model import State
from arkitect.types.responses.event import BaseEvent


"""
Agent is the core interface for all runnable agents
"""


class BaseAgent(abc.ABC, BaseModel):
    name: str
    description: str = ""
    model: str
    tools: list[Union[MCPClient | Callable]] = []
    sub_agents: list["BaseAgent"] = []
    mcp_clients: dict[str, MCPClient] = {}
    instruction: str | None = None

    model_config = {
        "arbitrary_types_allowed": True,
    }

    # stream run step
    @abc.abstractmethod
    async def _astream(self, state: State, **kwargs) -> AsyncIterable[BaseEvent]:
        pass

    async def astream(self, state: State, **kwargs) -> AsyncIterable[BaseEvent]:
        async for event in self._astream(state, **kwargs):
            if event.author == "":
                event.author = self.name
            yield event

    async def __call__(self, state: State, **kwargs) -> AsyncIterable[BaseEvent]:
        async for event in self.astream(state, **kwargs):
            yield event


class SwitchAgent(BaseModel):
    agent_name: str
    message: str

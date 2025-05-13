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

import abc
from typing import Any, AsyncIterable, Callable, Union

from pydantic import BaseModel

from arkitect.core.component.context.model import State
from arkitect.core.component.tool import MCPClient
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
    async def _astream(self, state: State, **kwargs: Any) -> AsyncIterable[BaseEvent]:
        pass

    async def astream(self, state: State, **kwargs: Any) -> AsyncIterable[BaseEvent]:
        async for event in self._astream(state, **kwargs):
            if event.author == "":
                event.author = self.name
            yield event

    async def __call__(self, state: State, **kwargs: Any) -> AsyncIterable[BaseEvent]:
        async for event in self.astream(state, **kwargs):
            yield event


class SwitchAgent(BaseModel):
    agent_name: str
    message: str

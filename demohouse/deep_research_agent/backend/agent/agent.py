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
from typing import AsyncIterable, Union, List, Literal

from openai import BaseModel

from arkitect.types.llm.model import ArkMessage
from demohouse.deep_research_agent.backend.planning.planning import PlanningItem

"""
AgentStepOutputResponse is the non-stream response for agent run
"""


class AgentStepOutputResponse(BaseModel):
    pass


"""
AgentStepOutputChunk is the stream chunk for agent run
"""


class AgentStepOutputChunk(BaseModel):
    pass


"""
Agent is the core interface for all runnable agents
"""


class Agent(abc.ABC):
    def __init__(self,
                 instruction: Union[str, List[ArkMessage]],
                 task: Union[str, PlanningItem]) -> None:
        pass

    # non-stream run step
    @abc.abstractmethod
    async def arun_step(self, **kwargs) -> AgentStepOutputResponse:
        pass

    # stream run step
    @abc.abstractmethod
    async def astream_step(self, **kwargs) -> AsyncIterable[AgentStepOutputChunk]:
        pass

    # returns if the agent task finished
    @abc.abstractmethod
    def finished(self) -> bool:
        pass


class SearchAgent(Agent, BaseModel):
    mcp_server: List['remote.yaml']

    def __init__(self):
        self.mcp_clients = init_mcp_client(self.mcp_server)

    def _step(self):
        llm.astream(
            functions=self.mcp_clients,
        )

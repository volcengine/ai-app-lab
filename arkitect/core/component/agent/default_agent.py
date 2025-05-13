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

from typing import AsyncIterable, Callable, Union
from pydantic import BaseModel
from arkitect.core.component.agent import BaseAgent

from arkitect.core.component.tool import MCPClient
from arkitect.core.component.context.model import State
from arkitect.types.responses.event import BaseEvent
from arkitect.core.component.context.llm_event_stream import LLMEventStream


"""
Agent is the core interface for all runnable agents
"""


class DefaultAgent(BaseAgent):
    name: str
    description: str = ""
    model: str
    tools: list[Union[MCPClient | Callable]] = []
    sub_agents: list["BaseAgent"] = []
    mcp_clients: dict[str, MCPClient] = {}

    model_config = {
        "arbitrary_types_allowed": True,
    }

    # stream run step
    async def _astream(self, state: State, **kwargs) -> AsyncIterable[BaseEvent]:
        event_stream = LLMEventStream(
            model=self.model,
            agent_name=self.name,
            tools=self.tools,
            sub_agents=self.sub_agents,
            state=state,
            instruction=self.instruction,
        )
        await event_stream.init()
        resp_stream = await event_stream.completions.create(
            messages=[],
            **kwargs,
        )

        async for event in resp_stream:
            yield event


class SwitchAgent(BaseModel):
    agent_name: str
    message: str

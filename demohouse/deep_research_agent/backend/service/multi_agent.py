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

from typing import Dict, AsyncIterable, Union, Optional

from pydantic import BaseModel, Field

from arkitect.telemetry.logger import INFO

from agent.agent import AgentTemplate
from agent.worker import WorkerAgent
from models.messages import MessageChunk
from models.planning import PlanningItem, Planning
from models.tool_events import ToolCallEvent, ToolCompletedEvent, AssignTodoToolCompletedEvent, \
    PlanningMakeToolCompletedEvent
from planning.planner import Planner, ReasoningLLMPlanner
from supervisor.default import DefaultSupervisor


class MultiAgentService(BaseModel):
    default_llm_model: str = ''
    agents: Dict[str, AgentTemplate] = {}
    planner: Planner = Field(default_factory=ReasoningLLMPlanner)
    planning: Planning = Field(default_factory=Planning)

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def astream(
            self,
            root_task: Optional[str] = '',
            planning: Optional[Planning] = None,
    ) -> AsyncIterable[
        Union[MessageChunk, ToolCallEvent, ToolCompletedEvent]
    ]:
        # 1. restore the checkpoint or make new one
        if not planning:
            async for chunk in self._make_plan(root_task=root_task):
                yield chunk
        else:
            self.planning = planning

        INFO(f'planning: \n {self.planning.to_markdown_str()}')

        # 2. run supervisor
        while self.planning.get_todos():
            async for chunk in self._supervisor_step(planning=self.planning):
                yield chunk

    def dump_planning(self):
        return self.planning

    async def _make_plan(self, root_task: str) -> AsyncIterable[
        Union[MessageChunk, ToolCallEvent, ToolCompletedEvent]
    ]:
        async for chunk in self.planner.astream_make_planning(
                task=root_task
        ):
            if isinstance(chunk, PlanningMakeToolCompletedEvent):
                self.planning = chunk.planning
            yield chunk

    async def _agent_step(self,
                          planning: Planning,
                          planning_item: PlanningItem,
                          agent: AgentTemplate) -> AsyncIterable[
        Union[MessageChunk, ToolCallEvent, ToolCompletedEvent]
    ]:
        # new worker agent
        worker = WorkerAgent(
            llm_model=self.default_llm_model,
            planning=planning,
            planning_item=planning_item,
            **agent.__dict__,
        )

        async for chunk in worker.astream_step():
            yield chunk

    async def _supervisor_step(self, planning: Planning) -> AsyncIterable[
        Union[MessageChunk, ToolCallEvent, ToolCompletedEvent]
    ]:
        # new instance
        supervisor = DefaultSupervisor(
            llm_model=self.default_llm_model,
            planning=planning,
            worker_agents=self.agents,
        )

        next_todo: Optional[AssignTodoToolCompletedEvent] = None

        # assign task
        async for ac in supervisor.astream_assign_next_todo():
            if isinstance(ac, AssignTodoToolCompletedEvent):
                next_todo = ac
            else:
                yield ac

        if not next_todo:
            INFO("get empty next todo")
            return

        # run agent
        async for agent_step in self._agent_step(
                planning, next_todo.planning_item, self.agents.get(next_todo.worker_agent)
        ):
            yield agent_step

        # feedback
        async for accept_step in supervisor.receive_step(next_todo.planning_item):
            yield accept_step


if __name__ == "__main__":

    async def add(a: int, b: int) -> int:
        """Add two numbers
        """
        return a + b


    async def compare(a: int, b: int) -> int:
        """Compare two numbers, return the bigger one
        """
        return a if a > b else b


    async def main():
        service = MultiAgentService(
            default_llm_model='deepseek-r1-250120',
            agents={
                'adder': AgentTemplate(name='adder', instruction='会计算两位数的加法', tools=[add]),
                'comparer': AgentTemplate(name='comparer', instruction='能够比较两个数字的大小并找到最大的那个',
                                          tools=[compare])
            }
        )

        async for chunk in service.astream(
                root_task='判断 (1+ 192) 和 (23 + 173) 哪个更大'
        ):
            if isinstance(chunk, MessageChunk):
                print(chunk.delta, end="")
            else:
                print(f"\n{chunk}\n")


    import asyncio

    asyncio.run(main())

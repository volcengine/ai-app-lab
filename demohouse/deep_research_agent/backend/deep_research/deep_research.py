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

from arkitect.telemetry.logger import INFO

from agent.worker import Worker
from agent.planner import Planner
from agent.supervisor import Supervisor
from models.events import *
from state.deep_research_state import DeepResearchState
from state.global_state import GlobalState


class DeepResearch(BaseModel):
    default_llm_model: str = ''
    workers: Dict[str, Worker] = {}

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def astream(
            self,
            root_task: str,
            dr_state: DeepResearchState,
    ) -> AsyncIterable[BaseEvent]:
        global_state = GlobalState(
            custom_state=dr_state,
        )
        # 1. restore the checkpoint or make new one
        if not dr_state.planning:
            async for chunk in self._make_plan(root_task=root_task, global_state=global_state):
                yield chunk

        INFO(f'planning: \n {dr_state.planning.to_markdown_str()}')

        # 2. run with supervisor
        supervisor = Supervisor(
            llm_model=self.default_llm_model,
            workers=self.workers,
        )

        async for event in supervisor.astream(
                global_state=global_state,
        ):
            yield event

    async def _make_plan(self, root_task: str, global_state: GlobalState) -> AsyncIterable[BaseEvent]:
        planner = Planner(
            llm_model=self.default_llm_model
        )

        async for chunk in planner.astream(
                global_state=global_state,
                task=root_task
        ):
            if isinstance(chunk, PlanningEvent):
                global_state.custom_state.planning = chunk.planning
            yield chunk


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

        dr_state = DeepResearchState()

        service = DeepResearch(
            default_llm_model='deepseek-r1-250120',
            workers={
                'adder': Worker(llm_model='deepseek-r1-250120', name='adder', instruction='会计算两位数的加法',
                                tools=[add]),
                'comparer': Worker(llm_model='deepseek-r1-250120', name='comparer',
                                   instruction='能够比较两个数字的大小并找到最大的那个',
                                   tools=[compare])
            }
        )

        async for chunk in service.astream(
                root_task='判断 (1+ 192) 和 (23 + 173) 哪个更大',
                dr_state=dr_state,
        ):
            if isinstance(chunk, MessageEvent):
                print(chunk.delta, end="")
            else:
                print(f"\n{chunk}\n")


    import asyncio

    asyncio.run(main())

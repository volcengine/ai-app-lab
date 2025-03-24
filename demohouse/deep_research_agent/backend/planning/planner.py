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
from abc import ABC
from typing import AsyncIterable, Union, List, Optional

from pydantic import BaseModel
from jinja2 import Template

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.prompts import CustomPromptTemplate
from arkitect.telemetry.logger import INFO
from arkitect.types.llm.model import ArkMessage
from models.messages import MessageChunk, ReasoningChunk, OutputTextChunk

from models.planning import Planning, PlanningItem
from models.tool_events import PlanningMakeToolCallEvent, PlanningMakeToolCompletedEvent
from prompt.planning import DEFAULT_PLANNER_PROMPT

"""
Planner is an interface to generate planning for single task
"""


class Planner(ABC):
    @abc.abstractmethod
    async def make_planning(self, task: str) -> Planning:
        pass

    @abc.abstractmethod
    async def astream_make_planning(self, task: str) -> AsyncIterable[
        Union[MessageChunk, PlanningMakeToolCallEvent, PlanningMakeToolCompletedEvent]
    ]:
        pass


class ReasoningLLMPlanner(BaseModel, Planner):
    llm_model: str = "deepseek-r1-250120"
    prompt: str = DEFAULT_PLANNER_PROMPT
    planning: Optional[Planning] = None

    async def make_planning(self, task: str) -> Planning:
        llm = BaseChatLanguageModel(
            model=self.llm_model,
            template=CustomPromptTemplate(template=Template(self.prompt)),
            messages=[
                ArkMessage(role="user", content="run")
            ],
        )

        result = await llm.arun(
            task=task,
            functions=[self.save_planning],
        )

        INFO(f"planner llm result: {result}")

        return self.planning

    async def astream_make_planning(self, task: str) -> AsyncIterable[
        Union[MessageChunk, PlanningMakeToolCallEvent, PlanningMakeToolCompletedEvent]
    ]:
        llm = BaseChatLanguageModel(
            model=self.llm_model,
            template=CustomPromptTemplate(template=Template(self.prompt)),
            messages=[
                ArkMessage(role="user", content="run this task")
            ],
        )

        rsp_stream = llm.astream(
            task=task,
            functions=[self.save_planning],
        )

        async for chunk in rsp_stream:
            if chunk.choices[0].delta.reasoning_content:
                yield ReasoningChunk(
                    delta=chunk.choices[0].delta.reasoning_content
                )
            elif chunk.choices[0].delta.content:
                yield OutputTextChunk(
                    delta=chunk.choices[0].delta.content
                )

        # currently we manually generate the tool call stream events here.
        yield PlanningMakeToolCallEvent(task=task)
        yield PlanningMakeToolCompletedEvent(planning=self.planning)

    def save_planning(self, task_list: List[str]) -> str:
        """当你完成任务计划拆解时，调用此函数将拆解好的计划保存

        Args:
            task_list: 拆解的任务列表，每个元素都是一个任务描述

        Returns:
            None
        """
        self.planning = Planning(
            items={
                str(i + 1): PlanningItem(
                    id=str(i + 1),
                    description=t,
                    done=False
                ) for t, i in zip(task_list, range(len(task_list)))
            }
        )

        return 'planning saved.'


if __name__ == "__main__":
    async def main():
        planner = ReasoningLLMPlanner()
        async for chunk in planner.astream_make_planning(
                task="分析英伟达过去20个月的股票表现，给出中短期的投资建议"
        ):
            if isinstance(chunk, MessageChunk):
                print(chunk.delta, end="")
            if isinstance(chunk, PlanningMakeToolCallEvent):
                print("making planning...")
            if isinstance(chunk, PlanningMakeToolCompletedEvent):
                print(f"completed planning...")
                print(planner.planning.to_markdown_str(include_progress=False))


    import asyncio

    asyncio.run(main())

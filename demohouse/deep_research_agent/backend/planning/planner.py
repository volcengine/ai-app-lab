from typing import AsyncIterable, Union, List, Optional

from pydantic import BaseModel
from jinja2 import Template

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.prompts import CustomPromptTemplate
from arkitect.telemetry.logger import INFO
from arkitect.types.llm.model import ArkMessage

from planning.planning import Planner, Planning, PlanningItem
from prompt.planning import DEFAULT_PLANNER_PROMPT


class ReasoningLLMPlanner(BaseModel, Planner):
    llm_model: str = "deepseek-r1-250120"
    prompt: str = DEFAULT_PLANNER_PROMPT
    planning: Optional[Planning] = None

    async def make_planning(self, task: str) -> Planning:
        llm = BaseChatLanguageModel(
            model=self.llm_model,
            template=CustomPromptTemplate(template=Template(self.prompt)),
            messages=[
                ArkMessage(role="user", content="请运行")
            ],
        )

        result = await llm.arun(
            task=task,
            functions=[self.save_planning],
        )

        INFO(f"planner llm result: {result}")

        return self.planning

    async def astream_make_planning(self, task: str) -> AsyncIterable[Union[str, Planning]]:
        pass

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
        pl = await planner.make_planning("分析一下英伟达过去20个月的股票表现，分别给出长短期的投资建议")
        print(pl)


    import asyncio

    asyncio.run(main())

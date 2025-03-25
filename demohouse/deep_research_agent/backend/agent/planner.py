from typing import AsyncIterable, Optional, List

from jinja2 import Template

from agent.agent import Agent
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.prompts import CustomPromptTemplate
from arkitect.types.llm.model import ArkMessage
from models.events import BaseEvent, ReasoningEvent, OutputTextEvent, PlanningEvent, MessageEvent
from models.planning import Planning, PlanningItem
from prompt.planning import DEFAULT_PLANNER_PROMPT
from state.deep_research_state import DeepResearchState
from state.global_state import GlobalState


class Planner(Agent):
    prompt: str = DEFAULT_PLANNER_PROMPT
    planning: Optional[Planning] = None

    async def astream(self, global_state: GlobalState, **kwargs) -> AsyncIterable[BaseEvent]:
        task = kwargs.pop('task')

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
                yield ReasoningEvent(
                    delta=chunk.choices[0].delta.reasoning_content
                )
            elif chunk.choices[0].delta.content:
                yield OutputTextEvent(
                    delta=chunk.choices[0].delta.content
                )

        # currently we manually generate the tool call stream events.py here.
        custom_state: DeepResearchState = global_state.custom_state
        custom_state.planning = self.planning
        yield PlanningEvent(
            action='made',
            planning=self.planning,
        )

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
        planner = Planner(
            llm_model="deepseek-r1-250120"
        )
        async for chunk in planner.astream(
                global_state=GlobalState(
                    custom_state=DeepResearchState()
                ),
                task="分析英伟达过去20个月的股票表现，给出中短期的投资建议"
        ):
            if isinstance(chunk, MessageEvent):
                print(chunk.delta, end="")
            if isinstance(chunk, PlanningEvent):
                print(chunk)


    import asyncio

    asyncio.run(main())

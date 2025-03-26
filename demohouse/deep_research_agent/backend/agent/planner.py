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

from typing import AsyncIterable, Optional, List, Dict

from jinja2 import Template

from agent.agent import Agent
from agent.worker import Worker
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.prompts import CustomPromptTemplate
from arkitect.types.llm.model import ArkMessage, ArkChatParameters
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
        max_plannings = kwargs.pop('max_plannings')
        workers: Dict[str, Worker] = kwargs.pop('workers')

        llm = BaseChatLanguageModel(
            model=self.llm_model,
            template=CustomPromptTemplate(template=Template(self.prompt)),
            messages=[
                ArkMessage(role="user", content="run this task")
            ],
            parameters=ArkChatParameters(
                stream_options={'include_usage': True}
            )
        )

        rsp_stream = llm.astream(
            complex_task=task,
            max_plannings=max_plannings,
            worker_details=self._format_worker_details(workers),
            functions=[self.save_task],
        )

        async for chunk in rsp_stream:
            self.record_usage(chunk, global_state.custom_state.total_usage)
            if not chunk.choices:
                continue
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

    def _format_worker_details(self, workers: Dict[str, Worker]) -> str:
        descs = []
        for worker in workers.values():
            descs.append(f"name: {worker.name} 能力介绍: {worker.instruction}")
        return "\n".join(descs)

    def save_task(self, task_description: str, worker_name: str) -> str:
        """当你要向计划中添加一个任务的时候，调用此函数

        Args:
            task_description(str): 任务描述
            worker_name(str): 该任务要分配给哪个团队成员执行
        Returns:
            None
        """

        if not self.planning:
            self.planning = Planning(items=[])

        item = PlanningItem(
            id=str(len(self.planning.items) + 1),
            description=task_description,
            assign_agent=worker_name,
        )

        self.planning.items.append(item)

        return 'task added.'


if __name__ == "__main__":
    async def main():
        planner = Planner(
            llm_model="deepseek-r1-250120"
        )
        async for chunk in planner.astream(
                global_state=GlobalState(
                    custom_state=DeepResearchState()
                ),
                task="比较 (1 + 23) 和 (7 + 19) 哪个更大",
                max_plannings=10,
                workers={
                    'adder': Worker(llm_model='deepseek-r1-250120', name='adder', instruction='会计算两位数的加法'),
                    'comparer': Worker(llm_model='deepseek-r1-250120', name='comparer',
                                       instruction='能够比较两个数字的大小并找到最大的那个')
                }
        ):
            if isinstance(chunk, MessageEvent):
                print(chunk.delta, end="")
            if isinstance(chunk, PlanningEvent):
                print(chunk)

        print(planner.planning.to_markdown_str())


    import asyncio

    asyncio.run(main())

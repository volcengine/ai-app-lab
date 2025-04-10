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

from typing import AsyncIterable, Optional

from volcenginesdkarkruntime.types.completion_usage import CompletionTokensDetails

from agent.summary import Summary

from agent.worker import Worker
from agent.supervisor import Supervisor
from models.events import *
from state.deep_research_state import DeepResearchState, DeepResearchStateManager
from state.global_state import GlobalState
from tools.mock import add, compare


class DeepSearch(BaseModel):
    supervisor_llm_model: str = ''
    summary_llm_model: str = ''
    workers: Dict[str, Worker] = {}
    dynamic_planning: bool = False
    max_planning_items: int = 10
    state_manager: Optional[DeepResearchStateManager] = None

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def astream(
            self,
            dr_state: DeepResearchState,
    ) -> AsyncIterable[BaseEvent]:
        global_state = GlobalState(
            custom_state=dr_state,
        )

        if dr_state.planning and dr_state.planning.items:
            # load from session, yield a load chunk
            yield PlanningEvent(action='load', planning=dr_state.planning)

        # 1. run with supervisor
        supervisor = Supervisor(
            llm_model=self.supervisor_llm_model,
            workers=self.workers,
            dynamic_planning=self.dynamic_planning,
            max_plannings=self.max_planning_items,
            state_manager=self.state_manager,
        )

        async for event in supervisor.astream(
                global_state=global_state,
        ):
            yield event

        # 2. until no more todos
        if not dr_state.planning.get_todos():
            yield PlanningEvent(
                action='done',
                planning=dr_state.planning,
                usage=CompletionUsage(
                    prompt_tokens=dr_state.total_usage.prompt_tokens,
                    completion_tokens=dr_state.total_usage.completion_tokens,
                    total_tokens=(dr_state.total_usage.prompt_tokens + dr_state.total_usage.completion_tokens),
                    completion_tokens_details=CompletionTokensDetails(
                        reasoning_tokens=dr_state.total_usage.reasoning_tokens,
                    )
                )
            )

        # if planning finished, run an agent to summary
        answer = Summary(
            llm_model=self.summary_llm_model
        )
        async for event in answer.astream(
                global_state=global_state
        ):
            yield event

        # yield a special event to mark the session finished
        yield EOFEvent(references=global_state.custom_state.references)


if __name__ == "__main__":

    async def main():

        dr_state = DeepResearchState(
            root_task='比较 (1 + 23) 和 (7 + 19) 哪个更大'
        )

        service = DeepSearch(
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
                dr_state=dr_state,
        ):
            if isinstance(chunk, MessageEvent):
                print(chunk.delta, end="")
            else:
                print(f"\n{chunk}\n")


    import asyncio

    asyncio.run(main())

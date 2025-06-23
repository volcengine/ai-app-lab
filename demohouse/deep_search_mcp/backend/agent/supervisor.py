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
import traceback
from typing import AsyncIterable, Dict, Any, Optional

from jinja2 import Template
from pydantic import BaseModel
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk
from volcenginesdkarkruntime.types.completion_usage import (
    CompletionUsage,
    CompletionTokensDetails,
)

from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import (
    PostToolCallHook,
    HookInterruptException,
)
from arkitect.core.component.context.model import State
from arkitect.core.errors import InvalidParameter, InternalServiceError
from agent.agent import Agent
from agent.worker import Worker
from arkitect.telemetry.logger import ERROR
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatParameters
from models.events import (
    BaseEvent,
    OutputTextEvent,
    ReasoningEvent,
    AssignTodoEvent,
    PlanningEvent,
    ErrorEvent,
)
from models.planning import PlanningItem, Planning
from prompt.planning import DEFAULT_PLANNING_MAKE_PROMPT, DEFAULT_PLANNING_UPDATE_PROMPT
from state.deep_search_state import DeepSearchState, DeepSearchStateManager
from state.global_state import GlobalState
from utils.common import get_env_info
from utils.planning_holder import PlanningHolder
from tools.mock import add, compare


class SupervisorControlHook(PostToolCallHook):
    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        if name not in ["_assign_next_todo", "_accept_agent_response"]:
            # pass
            return state
        if exception:
            raise HookInterruptException(
                reason="exception",
                details=exception,
                state=state,
            )
        else:
            raise HookInterruptException(
                reason="finished", details=response, state=state
            )


class AssignWorkerResponse(BaseModel):
    agent_name: str
    task_id: str


class AcceptAgentResponse(BaseModel):
    accept: bool
    append_description: str = ""


class Supervisor(Agent):
    workers: Dict[str, Worker] = {}
    planning_update_prompt: str = DEFAULT_PLANNING_UPDATE_PROMPT
    planning_make_prompt: str = DEFAULT_PLANNING_MAKE_PROMPT
    dynamic_planning: bool = False  # enable the dynamic planning ability
    max_plannings: int = (10,)
    _control_hook: SupervisorControlHook = SupervisorControlHook()
    state_manager: Optional[DeepSearchStateManager] = None

    # @task()
    async def astream(
        self, global_state: GlobalState, **kwargs
    ) -> AsyncIterable[BaseEvent]:
        # extract args:

        planning: Planning = global_state.custom_state.planning

        if not planning or not planning.items:
            # 1. make plan
            planning = Planning(root_task=global_state.custom_state.root_task, items=[])
            global_state.custom_state.planning = planning
            async for chunk in self._make_planning(global_state):
                yield chunk

            if planning.is_denied:
                yield PlanningEvent(
                    action="denied",
                    planning=planning,
                    usage=self._to_completion_usage(global_state),
                )
                return

            yield PlanningEvent(
                action="made",
                planning=planning,
                usage=self._to_completion_usage(global_state),
            )
            if self.state_manager:
                await self.state_manager.dump(global_state.custom_state)
            return

        while planning.get_todos():
            next_todo = planning.get_next_todo()
            # 2. assign next_todo
            yield AssignTodoEvent(
                agent_name=next_todo.assign_agent,
                planning_item=next_todo,
            )

            if next_todo.assign_agent not in self.workers.keys():
                yield ErrorEvent(api_exception=InvalidParameter(parameter="next_agent"))
                return

            # 3. run agent
            worker = self.workers.get(next_todo.assign_agent)
            try:
                async for worker_chunk in worker.astream(
                    global_state=global_state,
                    task_id=next_todo.id,
                ):
                    yield worker_chunk
            except Exception as e:
                ERROR(f"run worker error: {e}")
                traceback.print_exc()
                yield ErrorEvent(api_exception=InternalServiceError(message=str(e)))
                return

            # 4. update planning (if it needs)
            if self.dynamic_planning:
                # dynamic update the planning
                async for receive_chunk in self._update_planning(
                    global_state=global_state,
                    task_to_update=next_todo,
                ):
                    yield receive_chunk
            else:
                # accept directly
                next_todo.done = True
                planning.update_item(next_todo.id, next_todo)

            if self.state_manager:
                await self.state_manager.dump(state=global_state.custom_state)

            yield PlanningEvent(
                action="update",
                planning=planning,
                usage=self._to_completion_usage(global_state),
            )

    @task(trace_all=False)
    async def _make_planning(
        self, global_state: GlobalState
    ) -> AsyncIterable[BaseEvent]:

        planning = global_state.custom_state.planning

        planning_holder = PlanningHolder(
            planning=planning,
            max_plannings=self.max_plannings,
        )
        ctx = Context(
            model=self.llm_model,
            tools=[planning_holder.save_tasks],
            parameters=ArkChatParameters(stream_options={"include_usage": True}),
        )

        await ctx.init()

        rsp_stream = await ctx.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": await self._prepare_make_planning_prompt(
                        root_task=planning.root_task
                    ),
                },
            ],
        )

        buffer_response = ''
        async for chunk in rsp_stream:
            self.record_usage(chunk, global_state.custom_state.total_usage)
            # we ignore the tool chunks
            if (
                isinstance(chunk, ChatCompletionChunk)
                and chunk.choices
                and chunk.choices[0].delta.content
            ):
                buffer_response += chunk.choices[0].delta.content
                yield OutputTextEvent(delta=chunk.choices[0].delta.content)
            if (
                isinstance(chunk, ChatCompletionChunk)
                and chunk.choices
                and chunk.choices[0].delta.reasoning_content
            ):
                yield ReasoningEvent(delta=chunk.choices[0].delta.reasoning_content)
        if "<|NEED_MORE_INFO|>" in buffer_response:
            planning.is_denied = True

    @task(trace_all=False)
    async def _update_planning(
        self, global_state: GlobalState, task_to_update: PlanningItem
    ) -> AsyncIterable[BaseEvent]:
        planning = global_state.custom_state.planning

        planning_holder = PlanningHolder(
            planning=planning, max_plannings=self.max_plannings
        )
        ctx = Context(
            model=self.llm_model,
            tools=[
                planning_holder.update_task,
                planning_holder.mark_task_done,
                planning_holder.add_task,
                planning_holder.delete_task,
            ],
            parameters=ArkChatParameters(stream_options={"include_usage": True}),
        )

        await ctx.init()

        rsp_stream = await ctx.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": self._prepare_update_planning_prompt(
                        planning=planning,
                        completed_task=task_to_update,
                    ),
                },
            ],
        )

        async for chunk in rsp_stream:
            self.record_usage(chunk, global_state.custom_state.total_usage)
            # we ignore the tool chunks
            if (
                isinstance(chunk, ChatCompletionChunk)
                and chunk.choices
                and chunk.choices[0].delta.content
            ):
                yield OutputTextEvent(delta=chunk.choices[0].delta.content)
            if (
                isinstance(chunk, ChatCompletionChunk)
                and chunk.choices
                and chunk.choices[0].delta.reasoning_content
            ):
                yield ReasoningEvent(delta=chunk.choices[0].delta.reasoning_content)

    async def _prepare_make_planning_prompt(self, root_task: str) -> str:
        # this prompt can be dynamic load.
        return Template(self.planning_make_prompt).render(
            complex_task=root_task,
            worker_details=self._format_agent_desc(),
            max_plannings=self.max_plannings,
            env_info=get_env_info(),
        )

    def _prepare_update_planning_prompt(
        self, planning: Planning, completed_task: PlanningItem
    ) -> str:
        return Template(self.planning_update_prompt).render(
            complex_task=planning.root_task,
            worker_details=self._format_agent_desc(),
            planning_details=planning.to_dashboard(),
            max_plannings=self.max_plannings,
            worker_name=completed_task.assign_agent,
            completed_task=f"{completed_task.id}: {completed_task.description}",
            completed_task_result=completed_task.result_summary,
        )

    def _format_agent_desc(self) -> str:
        descs = []
        for worker in self.workers.values():
            descs.append(f"成员name: {worker.name}  成员能力: {worker.instruction}")
        return "\n".join(descs)

    def _to_completion_usage(
        self, global_state: GlobalState
    ) -> Optional[CompletionUsage]:
        if isinstance(global_state.custom_state, DeepSearchState):
            if global_state.custom_state.total_usage:
                return CompletionUsage(
                    prompt_tokens=global_state.custom_state.total_usage.prompt_tokens,
                    completion_tokens=global_state.custom_state.total_usage.completion_tokens,
                    total_tokens=(
                        global_state.custom_state.total_usage.prompt_tokens
                        + global_state.custom_state.total_usage.completion_tokens
                    ),
                    completion_tokens_details=CompletionTokensDetails(
                        reasoning_tokens=global_state.custom_state.total_usage.reasoning_tokens,
                    ),
                )
        return None


if __name__ == "__main__":

    async def main():

        global_state = GlobalState(
            custom_state=DeepSearchState(root_task="判断(1+20) 和 (22 + 23) 哪个结果大")
        )

        supervisor = Supervisor(
            llm_model="deepseek-r1-250120",
            workers={
                "adder": Worker(
                    llm_model="deepseek-r1-250120",
                    name="adder",
                    instruction="做加法",
                    tools=[add],
                ),
                "comparer": Worker(
                    llm_model="deepseek-r1-250120",
                    name="comparer",
                    instruction="比较两个数大小",
                    tools=[compare],
                ),
            },
            dynamic_planning=True,
        )

        thinking = True

        async for chunk in supervisor.astream(global_state=global_state):
            if isinstance(chunk, OutputTextEvent):
                if thinking:
                    thinking = False
                    print("---思考结束---")
                print(chunk.delta, end="")
            elif isinstance(chunk, ReasoningEvent):
                if not thinking:
                    print("---思考开始---")
                    thinking = True
                print(chunk.delta, end="")
            else:
                print(chunk)

        print(global_state.custom_state.planning.to_markdown_str())

    import asyncio

    asyncio.run(main())

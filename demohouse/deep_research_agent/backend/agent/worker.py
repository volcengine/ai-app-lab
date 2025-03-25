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

from typing import AsyncIterable, Optional, Any

from pydantic import Field, BaseModel
from jinja2 import Template
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import Agent
from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import PostToolCallHook, PreToolCallHook, HookInterruptException
from arkitect.core.component.context.model import State, ContextInterruption

from models.events import BaseEvent, OutputTextEvent, ReasoningEvent, InternalServiceError, InvalidParameter
from models.planning import PlanningItem, Planning
from prompt.worker import DEFAULT_WORKER_PROMPT
from state.deep_research_state import DeepResearchState
from state.global_state import GlobalState
from utils.converter import convert_post_tool_call_to_event, convert_pre_tool_call_to_event


class WorkerToolCallHook(BaseModel, PostToolCallHook, PreToolCallHook):
    async def pre_tool_call(self, name: str, arguments: str, state: State) -> State:
        if isinstance(state.details, dict) and state.details.get('interrupt', False):
            state.details.update({'interrupt': False})
            return state
        else:
            if not state.details:
                state.details = {'interrupt': True}
            else:
                state.details.update({'interrupt': True})
            raise HookInterruptException(
                reason='tool_call',
                state=state,
                details=convert_pre_tool_call_to_event(function_name=name, function_parameter=arguments)
            )

    async def post_tool_call(self, name: str, arguments: str, response: Any, exception: Optional[Exception],
                             state: State) -> State:
        raise HookInterruptException(
            reason='tool_call',
            state=state,
            details=convert_post_tool_call_to_event(
                function_name=name,
                function_parameter=arguments,
                exception=exception,
                function_result=response
            )
        )


class Worker(Agent):
    system_prompt: str = DEFAULT_WORKER_PROMPT
    _tool_call_hook: WorkerToolCallHook = WorkerToolCallHook()

    async def astream(
            self,
            global_state: GlobalState,
            **kwargs,
    ) -> AsyncIterable[BaseEvent]:

        # extract args:

        planning: Planning = global_state.custom_state.planning
        task_id = kwargs.pop('task_id')

        if not planning or not task_id or not planning.get_item(task_id):
            yield InvalidParameter(paramter="task_id")

        planning_item = planning.get_item(task_id)

        ctx_state: Optional[State] = None

        while True:
            ctx = Context(
                model=self.llm_model,
                tools=self.tools,
                state=ctx_state,
            )

            await ctx.init()
            ctx.add_pre_tool_call_hook(self._tool_call_hook)
            ctx.add_post_tool_call_hook(self._tool_call_hook)

            messages = [] if ctx_state else [
                {"role": "system",
                 "content": self.generate_system_prompt(planning=planning, planning_item=planning_item)},
            ]

            rsp_stream = await ctx.completions.create(
                messages=messages,
            )

            try:
                async for chunk in rsp_stream:
                    if isinstance(chunk, ContextInterruption):
                        ctx_state = chunk.state
                        if isinstance(chunk.details, BaseEvent):
                            yield chunk.details
                        break
                    if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.content:
                        yield OutputTextEvent(delta=chunk.choices[0].delta.content)
                    if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.reasoning_content:
                        yield ReasoningEvent(delta=chunk.choices[0].delta.reasoning_content)
                    if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].finish_reason in ['stop', 'length',
                                                                                                     'content_filter']:
                        last_message = ctx.get_latest_message()
                        # update planning
                        planning_item.result_summary = last_message.get('content')
                        planning.update_item(task_id, planning_item)
                        # end the loop
                        return
            except Exception as e:
                yield InternalServiceError(error_msg=str(e))
                return

    def generate_system_prompt(self, planning: Planning, planning_item: PlanningItem) -> str:
        return Template(self.system_prompt).render(
            instruction=self.instruction,
            complex_task=planning.root_task,
            planning_detail=planning.to_markdown_str(include_progress=False),
            task_id=str(planning_item.id),
            task_description=planning_item.description,
        )


if __name__ == "__main__":
    def add(a: int, b: int) -> int:
        """Add two numbers

        Args:
            a (int): first number
            b (int): second number

        Returns:
            int: sum of a and b
        """
        return a + b


    async def main() -> None:

        planning_item = PlanningItem(
            id='1',
            description="计算 1 + 19",
        )

        agent = Worker(
            llm_model="deepseek-r1-250120",
            instruction="数据计算专家，会做两位数的加法",
            tools=[add],
        )

        global_state = GlobalState(
            custom_state=DeepResearchState(
                planning=Planning(root_tasks='计算给出的问题', items={'1': planning_item})
            )
        )

        thinking = True

        async for chunk in agent.astream(
                global_state=global_state,
                task_id='1',
        ):
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

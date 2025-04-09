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
from typing import AsyncIterable, List, Optional

from jinja2 import Template
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import Agent
from arkitect.core.component.context.context import Context, ToolChunk
from arkitect.core.component.context.hooks import PostToolCallHook
from arkitect.core.errors import InvalidParameter, InternalServiceError
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatParameters

from models.events import BaseEvent, OutputTextEvent, ReasoningEvent, ErrorEvent
from models.planning import PlanningItem, Planning
from prompt.worker import DEFAULT_WORKER_PROMPT
from state.global_state import GlobalState
from utils.common import get_env_info
from utils.converter import (
    convert_post_tool_call_to_event,
    convert_pre_tool_call_to_event,
)


class Worker(Agent):
    system_prompt: str = DEFAULT_WORKER_PROMPT

    post_tool_call_hook: Optional[PostToolCallHook] = None

    @task(trace_all=False)
    async def astream(
        self,
        global_state: GlobalState,
        **kwargs,
    ) -> AsyncIterable[BaseEvent]:

        # extract args:

        planning: Planning = global_state.custom_state.planning
        task_id = kwargs.pop("task_id")

        if not planning or not task_id or not planning.get_item(task_id):
            yield ErrorEvent(api_exception=InvalidParameter(parameter="task_id"))

        planning_item = planning.get_item(task_id)

        ctx = Context(
            model=self.llm_model,
            tools=self.tools,
            parameters=ArkChatParameters(stream_options={"include_usage": True}),
        )

        await ctx.init()
        ctx.set_post_tool_call_hook(self.post_tool_call_hook)

        rsp_stream = await ctx.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": self.generate_system_prompt(
                        planning=planning, planning_item=planning_item
                    ),
                },
            ],
        )

        try:
            async for chunk in rsp_stream:
                self.record_usage(chunk, global_state.custom_state.total_usage)
                if isinstance(chunk, ToolChunk):
                    if chunk.tool_exception or chunk.tool_response:
                        # post
                        yield convert_post_tool_call_to_event(
                            function_name=chunk.tool_name,
                            function_parameter=chunk.tool_arguments,
                            function_result=chunk.tool_response,
                            exception=chunk.tool_exception,
                        )
                    else:
                        # pre
                        yield convert_pre_tool_call_to_event(
                            function_name=chunk.tool_name,
                            function_parameter=chunk.tool_arguments,
                        )
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

            last_message = ctx.get_latest_message()
            # update planning (using a wrapper)
            planning_item.result_summary = f"{last_message.get('content')}"
            planning.update_item(task_id, planning_item)
            # end the loop
            return
        except Exception as e:
            yield ErrorEvent(api_exception=InternalServiceError(message=str(e)))
            return

    def generate_system_prompt(
        self, planning: Planning, planning_item: PlanningItem
    ) -> str:
        return Template(self.system_prompt).render(
            instruction=self.instruction,
            complex_task=planning.root_task,
            planning_detail=planning.to_dashboard(),
            task_id=str(planning_item.id),
            task_description=planning_item.description,
            env_info=get_env_info(),
        )

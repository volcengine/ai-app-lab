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

from typing import AsyncIterable

from jinja2 import Template
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import Agent
from arkitect.core.component.context.context import Context
from arkitect.types.llm.model import ArkChatParameters
from models.events import BaseEvent, OutputTextEvent, ReasoningEvent, InternalServiceError
from models.planning import Planning
from prompt.summary import get_summary_prompt
from state.global_state import GlobalState


class Summary(Agent):

    async def astream(self, global_state: GlobalState, **kwargs) -> AsyncIterable[BaseEvent]:
        ctx = Context(
            model=self.llm_model,
            tools=self.tools,
            parameters=ArkChatParameters(
                stream_options={'include_usage': True}
            )
        )

        await ctx.init()

        rsp_stream = await ctx.completions.create_chat_stream(
            messages=[
                {"role": "system",
                 "content": await self.generate_system_prompt(planning=global_state.custom_state.planning)},
            ],
        )

        try:
            async for chunk in rsp_stream:
                self.record_usage(chunk, global_state.custom_state.total_usage)
                if isinstance(chunk, ChatCompletionChunk) and chunk.choices and chunk.choices[0].delta.content:
                    yield OutputTextEvent(delta=chunk.choices[0].delta.content)
                if isinstance(chunk, ChatCompletionChunk) and chunk.choices and chunk.choices[0].delta.reasoning_content:
                    yield ReasoningEvent(delta=chunk.choices[0].delta.reasoning_content)
            return
        except Exception as e:
            yield InternalServiceError(error_msg=str(e))
            return

    async def generate_system_prompt(self, planning: Planning) -> str:
        # this prompt can by dynamic load
        prompt = await get_summary_prompt()
        return Template(prompt).render(
            instruction=self.instruction,
            complex_task=planning.root_task,
            planning_detail=planning.to_markdown_str(include_progress=False),
        )

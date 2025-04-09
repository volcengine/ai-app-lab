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
from arkitect.core.errors import InternalServiceError
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatParameters
from models.events import BaseEvent, OutputTextEvent, ReasoningEvent, ErrorEvent
from prompt.summary import DEFAULT_SUMMARY_PROMPT
from state.deep_research_state import DeepResearchState
from state.global_state import GlobalState
from utils.converter import convert_references_to_markdown


class Summary(Agent):
    prompt: str = DEFAULT_SUMMARY_PROMPT

    @task(trace_all=False)
    async def astream(
        self, global_state: GlobalState, **kwargs
    ) -> AsyncIterable[BaseEvent]:
        ctx = Context(
            model=self.llm_model,
            tools=self.tools,
            parameters=ArkChatParameters(stream_options={"include_usage": True}),
        )

        await ctx.init()

        rsp_stream = await ctx.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": await self.generate_prompt(
                        dr_state=global_state.custom_state
                    ),
                },
            ],
        )

        try:
            async for chunk in rsp_stream:
                self.record_usage(chunk, global_state.custom_state.total_usage)
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
            return
        except Exception as e:
            yield ErrorEvent(api_exception=InternalServiceError(message=str(e)))
            return

    async def generate_prompt(self, dr_state: DeepResearchState) -> str:
        return Template(self.prompt).render(
            instruction=self.instruction,
            complex_task=dr_state.planning.root_task,
            planning_detail=dr_state.planning.to_dashboard(),
            reference_detail=convert_references_to_markdown(dr_state.references),
        )

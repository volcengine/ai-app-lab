from typing import AsyncIterable

from jinja2 import Template
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import Agent
from arkitect.core.component.context.context import Context
from arkitect.types.llm.model import ArkChatParameters
from models.events import BaseEvent, OutputTextEvent, ReasoningEvent, InternalServiceError
from models.planning import Planning
from prompt.summary import DEFAULT_SUMMARY_PROMPT
from state.global_state import GlobalState


class Summary(Agent):
    system_prompt: str = DEFAULT_SUMMARY_PROMPT

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
                 "content": self.generate_system_prompt(planning=global_state.custom_state.planning)},
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

    def generate_system_prompt(self, planning: Planning) -> str:
        return Template(self.system_prompt).render(
            instruction=self.instruction,
            complex_task=planning.root_task,
            planning_detail=planning.to_markdown_str(include_progress=False),
        )

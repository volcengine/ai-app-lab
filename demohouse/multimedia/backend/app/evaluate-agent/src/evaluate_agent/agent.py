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

import json
from typing import AsyncGenerator

from google.genai import types
from typing_extensions import override

from google.adk.agents import InvocationContext
from google.adk.events import Event, EventActions
from veadk import Agent
from evaluate_agent.utils.types import (
    max_output_tokens_config,
)
from veadk.config import getenv

from .hook.direct_output_callback import direct_output_callback

# from .tools.byteval import evaluate_media, mock_evaluate_media
from .tools.geval import evaluate_media
from evaluate_agent.prompt import PROMPT_EVALUATE_AGENT


class EvaluateAgent(Agent):
    @override
    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        async for event in super()._run_async_impl(ctx):
            if (
                event.get_function_responses()
                and event.content.parts
                and len(event.content.parts) > 0
                and event.content.parts[0].function_response
                and event.content.parts[0].function_response.name == "evaluate_media"
            ):
                yield event
                # agent summary阶段，直接输出
                text = json.dumps(
                    event.content.parts[0].function_response.response,
                    ensure_ascii=False,
                )
                final_event = Event(
                    author=self.name,
                    invocation_id=ctx.invocation_id,
                    branch=ctx.branch,
                    content=types.Content(parts=[types.Part(text=text)]),
                    actions=EventActions(skip_summarization=True),
                )
                yield final_event
            else:
                yield event


agent = EvaluateAgent(
    name="evaluate_agent",
    description="根据用户的需求，评估分镜图片或分镜视频的质量",
    instruction=PROMPT_EVALUATE_AGENT,
    tools=[evaluate_media],
    after_tool_callback=[direct_output_callback],
    model_extra_config={
        "extra_body": {
            "thinking": {"type": getenv("THINKING_EVALUATE_AGENT", "enabled")}
        }
    },
    generate_content_config=max_output_tokens_config,
)

root_agent = agent

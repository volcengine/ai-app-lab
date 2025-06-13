# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Any, AsyncIterable

from pydantic import BaseModel

from arkitect.core.component.agent import BaseAgent
from arkitect.core.component.llm_event_stream.hooks import (
    PostLLMCallHook,
    PostToolCallHook,
    PreLLMCallHook,
    PreToolCallHook,
)
from arkitect.core.component.llm_event_stream.llm_event_stream import LLMEventStream
from arkitect.core.component.llm_event_stream.model import State
from arkitect.types.responses.event import BaseEvent

"""
Agent is the core interface for all runnable agents
"""


class DefaultAgent(BaseAgent):
    model_config = {
        "arbitrary_types_allowed": True,
    }

    pre_tool_call_hook: PreToolCallHook | None = None
    post_tool_call_hook: PostToolCallHook | None = None
    pre_llm_call_hook: PreLLMCallHook | None = None
    post_llm_call_hook: PostLLMCallHook | None = None

    # stream run step
    async def _astream(self, state: State, **kwargs: Any) -> AsyncIterable[BaseEvent]:
        event_stream = LLMEventStream(
            model=self.model,
            agent_name=self.name,
            tools=self.tools,
            sub_agents=self.sub_agents,
            state=state,
            instruction=self.instruction,
            pre_tool_call_hook=self.pre_tool_call_hook,
            post_tool_call_hook=self.post_tool_call_hook,
            pre_llm_call_hook=self.pre_llm_call_hook,
            post_llm_call_hook=self.post_llm_call_hook,
            parameters=self.parameters,
            client=self.client,
        )
        await event_stream.init()
        resp_stream = await event_stream.completions.create(
            messages=[],
            **kwargs,
        )

        async for event in resp_stream:
            yield event


class SwitchAgent(BaseModel):
    agent_name: str
    message: str

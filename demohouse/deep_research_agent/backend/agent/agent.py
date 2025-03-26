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

import abc
from typing import AsyncIterable, Union, List, Callable, Any

from pydantic import BaseModel
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from arkitect.core.component.tool import MCPClient
from arkitect.types.llm.model import ArkChatCompletionChunk
from models.events import BaseEvent
from models.usage import TotalUsage
from state.global_state import GlobalState

"""
Agent is the core interface for all runnable agents
"""


class Agent(abc.ABC, BaseModel):
    name: str = ""
    instruction: str = ""
    llm_model: str = ""
    tools: List[Union[MCPClient | Callable]] = []

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    # stream run
    @abc.abstractmethod
    async def astream(
            self,
            global_state: GlobalState,
            **kwargs,
    ) -> AsyncIterable[BaseEvent]:
        pass

    @classmethod
    def record_usage(cls, chunk: Any, total_usage: TotalUsage) -> None:
        if not isinstance(chunk, ChatCompletionChunk) and not isinstance(chunk, ArkChatCompletionChunk):
            return
        if chunk.usage:
            total_usage.prompt_tokens += chunk.usage.prompt_tokens
            total_usage.completion_tokens += chunk.usage.completion_tokens
            if chunk.usage.completion_tokens_details:
                total_usage.reasoning_tokens += (chunk.usage.completion_tokens_details.reasoning_tokens or 0)

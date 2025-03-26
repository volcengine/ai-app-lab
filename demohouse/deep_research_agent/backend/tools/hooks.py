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

from typing import Any, Optional

from pydantic import BaseModel
from volcenginesdkarkruntime.types.bot_chat import BotChatCompletion

from arkitect.core.component.context.hooks import PostToolCallHook
from arkitect.core.component.context.model import State
from arkitect.telemetry.logger import ERROR
from state.global_state import GlobalState


class WebSearchPostToolCallHook(BaseModel, PostToolCallHook):
    global_state: GlobalState

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(self, name: str, arguments: str, response: Any, exception: Optional[Exception],
                             state: State) -> State:
        if name != 'web_search':
            return state
        try:
            bot_response = BotChatCompletion.parse_raw(response)
            # 1. extract the response content as tool response
            if bot_response.choices and bot_response.choices[0].message:
                state.messages[-1].update({
                    'content': bot_response.choices[0].message.content
                })
            # 2. save the references into global state
            if bot_response.references:
                self.global_state.custom_state.references += bot_response.references
        except Exception as e:
            ERROR(f"fail to execute web search post tool call {e}")
            state.messages[-1].update({
                'content': f'执行工具错误: {e}'
            })

        return state

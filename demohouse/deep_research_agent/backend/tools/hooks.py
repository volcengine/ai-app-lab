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
from typing import Any, Optional

from pydantic import BaseModel

from arkitect.core.component.context.hooks import PostToolCallHook
from arkitect.core.component.context.model import State
from arkitect.telemetry.logger import ERROR
from state.global_state import GlobalState
from utils.converter import convert_bot_search_result_to_event, convert_python_execute_result_to_event, \
    convert_references_to_format_str


class WebSearchPostToolCallHook(BaseModel, PostToolCallHook):
    global_state: GlobalState

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(self, name: str, arguments: str, response: Any, exception: Optional[Exception],
                             state: State) -> State:
        if name != 'web_search':
            return state

        event = convert_bot_search_result_to_event(arguments, response)

        if event.success:
            state.messages[-1].update({
                'content': f"""
                [搜索总结]
                
                {event.summary}
                
                [参考资料]
                {convert_references_to_format_str(event.references)}
                """
            })
            # save references
            self.global_state.custom_state.references += event.references
        else:
            state.messages[-1].update({
                'content': f'执行工具错误：{event.error_msg}'
            })

        return state


class PythonExecutorPostToolCallHook(BaseModel, PostToolCallHook):
    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(self, name: str, arguments: str, response: Any, exception: Optional[Exception],
                             state: State) -> State:
        if name != 'python_executor':
            return state

        event = convert_python_execute_result_to_event(arguments, response)

        if event.success:
            state.messages[-1].update({
                'content': event.stdout
            })
        else:
            state.messages[-1].update({
                'content': f'执行工具错误：{event.error_msg}'
            })

        return state

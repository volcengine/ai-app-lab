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
from typing import List, Dict, Literal

from pydantic import BaseModel

from models.planning import Planning, PlanningItem


class BaseEvent(BaseModel):
    id: str = ''

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


"""
Errors
"""


class ErrorEvent(BaseEvent):
    error_code: str = ""
    error_msg: str = ""


class InvalidParameter(ErrorEvent):
    parameter: str = ""
    error_code: str = "InvalidParameter"
    error_msg: str = "the specific parameter is invalid"


class InternalServiceError(ErrorEvent):
    error_code: str = "InternalServiceError"


"""
Messages
"""


class MessageEvent(BaseEvent):
    type: str = ''


class OutputTextEvent(MessageEvent):
    type: str = 'output_text'
    delta: str = ''


class ReasoningEvent(MessageEvent):
    type: str = 'reasoning_text'
    delta: str = ''


"""
Tool-Using
"""


class ToolCallEvent(BaseEvent):
    type: str = ''
    status: str = 'pending'


class ToolCompletedEvent(BaseEvent):
    type: str = ''
    status: str = 'completed'
    success: bool = True
    error_msg: str = ''


"""
for function
"""


class FunctionCallEvent(ToolCallEvent):
    type: str = 'function'
    function_name: str = ''
    function_parameter: str = ''


class FunctionCompletedEvent(ToolCompletedEvent):
    type: str = 'function'
    function_name: str = ''
    function_parameter: str = ''
    function_result: str = ''


"""
for web search
"""


class WebSearchToolCallEvent(ToolCallEvent):
    type: str = "web_search"
    queries: List[str] = []


class WebSearchToolCompletedEvent(ToolCompletedEvent):
    type: str = "web_search"
    summaries: Dict[str, str]  # summary for each query
    references: List[any]  # reference urls, attach with query


"""
for link reader
"""


class LinkReaderToolCallEvent(ToolCallEvent):
    type: str = "link_reader"
    urls: List[str] = []


class LinkReaderToolCompletedEvent(ToolCompletedEvent):
    type: str = "link_reader"
    results: Dict[str, str]  # for each url


"""
for python executor
"""


class PythonExecutorToolCallEvent(ToolCallEvent):
    type: str = "python_executor"
    code: str = ""


class PythonExecutorToolCompletedEvent(ToolCompletedEvent):
    type: str = "python_executor"
    stdout: str = ""


"""
Custom Events
"""


class PlanningEvent(BaseEvent):
    type: str = 'planning'
    action: Literal['made', 'load', 'update']
    planning: Planning


class AssignTodoEvent(BaseEvent):
    type: str = 'assign_todo'
    agent_name: str = ''
    planning_item: PlanningItem

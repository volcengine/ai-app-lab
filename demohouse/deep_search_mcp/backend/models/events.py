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
from typing import List, Dict, Literal, Optional

from pydantic import BaseModel
from volcenginesdkarkruntime.types.bot_chat.bot_reference import Reference
from volcenginesdkarkruntime.types.completion_usage import CompletionUsage

from arkitect.core.errors import APIException
from arkitect.types.runtime.model import Response
from models.planning import Planning, PlanningItem


class BaseEvent(Response):
    id: str = ''
    session_id: Optional[str] = ''

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


"""
Errors
"""


class ErrorEvent(BaseEvent):
    api_exception: APIException


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
    function_result: Optional[str] = ''


"""
for web search
"""


class WebSearchToolCallEvent(ToolCallEvent):
    type: str = "web_search"
    query: str = ""


class WebSearchToolCompletedEvent(ToolCompletedEvent):
    type: str = "web_search"
    query: str = ""
    summary: str = ""
    references: Optional[List[Reference]] = []  # reference urls, attach with query


"""
for link reader
"""


class LinkReaderToolCallEvent(ToolCallEvent):
    type: str = "link_reader"
    urls: List[str] = []


class LinkReaderToolCompletedEvent(ToolCompletedEvent):
    type: str = "link_reader"
    results: List = []  # for each url


"""
for python executor
"""


class PythonExecutorToolCallEvent(ToolCallEvent):
    type: str = "python_executor"
    code: str = ""


class PythonExecutorToolCompletedEvent(ToolCompletedEvent):
    type: str = "python_executor"
    code: str = ""
    stdout: str = ""


"""
for knowledge base
"""


class KnowledgeBaseSearchToolCallEvent(ToolCallEvent):
    type: str = "knowledge_base_search"
    query: str = ""
    limit: int = 3
    collection_name: str = ""


class KnowledgeBaseSearchToolCompletedEvent(ToolCompletedEvent):
    type: str = "knowledge_base_search"
    references: List[Reference] = []  # for each url


"""
Custom Events
"""


class PlanningEvent(BaseEvent):
    type: str = 'planning'
    action: Literal['made', 'load', 'update', 'done']
    planning: Planning
    usage: Optional[CompletionUsage] = None


class AssignTodoEvent(BaseEvent):
    type: str = 'assign_todo'
    agent_name: str = ''
    planning_item: PlanningItem


# this event mark the session running is done.
class EOFEvent(BaseEvent):
    type: str = 'eof'
    references: List[Reference] = []

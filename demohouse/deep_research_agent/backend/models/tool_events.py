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

from typing import List, Dict

from pydantic import BaseModel, Field

from models.planning import Planning, PlanningItem

"""
ToolCall events will be sent when tool is called.
"""


class ToolCallEvent(BaseModel):
    type: str  # unique tool type

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


"""
ToolCompleted events will be send when the tool execution is completed.
"""


class ToolCompletedEvent(BaseModel):
    type: str  # unique tool type

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


"""
ToolException events will be sent when the tool execution is failed.
"""


class ToolExceptionEvent(BaseModel):
    type: str  # unique tool type
    exception: str  # exception message


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
for planner
"""


class PlanningMakeToolCallEvent(ToolCallEvent):
    type: str = "planning_make"
    task: str = ""


class PlanningMakeToolCompletedEvent(ToolCompletedEvent):
    type: str = "planning_make"
    planning: Planning = Field(default_factory=Planning)


"""
for supervisor
"""


class AssignTodoToolCallEvent(ToolCallEvent):
    type: str = "assign_todo"
    planning: Planning = Field(default_factory=Planning)  # echo current planning here


class AssignTodoToolCompletedEvent(ToolCompletedEvent):
    type: str = "assign_todo"
    planning_item: PlanningItem = Field(default_factory=PlanningItem)
    worker_agent: str

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

from typing import Literal, Optional, Union

from pydantic import BaseModel

from demohouse.deep_research_agent.backend.planning.planning import Planning


class WorkFlowResponse(BaseModel):
    id: str
    type: Literal['planning', 'message', 'function_call']
    status: Optional[Literal['pending', 'completed']]

    """
    for planning
    """
    planning: Optional[Planning]

    """
    for agent run
    """
    task_id: Optional[str]

    """
    for message type
    """
    role: Optional[str]
    reasoning_content: Optional[str]
    content: Optional[str]

    """
    for tool call
    """
    function_name: Optional[str]
    function_args: Optional[str]
    function_result: Optional[dict]

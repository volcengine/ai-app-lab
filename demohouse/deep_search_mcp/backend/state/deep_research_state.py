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
from typing import List, Any, Optional

from pydantic import BaseModel
from pydantic import Field
from volcenginesdkarkruntime.types.bot_chat.bot_reference import Reference

from models.planning import Planning
from models.usage import TotalUsage


class DeepResearchState(BaseModel):
    # session_id
    session_id: str = ''
    # root task
    root_task: str = ''
    # global planning
    planning: Optional[Planning] = None
    # searched references
    references: List[Reference] = []
    # token usages
    total_usage: TotalUsage = Field(default_factory=TotalUsage)
    # dynamic mask for mcp servers
    enabled_mcp_servers: List[str] = []

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


class DeepResearchStateManager(abc.ABC):

    @abc.abstractmethod
    async def dump(self, state: DeepResearchState) -> None:
        pass

    @abc.abstractmethod
    async def load(self) -> Optional[DeepResearchState]:
        pass

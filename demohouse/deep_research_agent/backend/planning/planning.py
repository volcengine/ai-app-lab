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
from abc import ABC
from typing import List, Optional, Dict, AsyncIterable, Union

from pydantic import BaseModel

"""
PlanningItem is a descriptor for single item
"""


class PlanningItem(BaseModel):
    # a specified id to unique mark this task
    id: str = ""
    # the plain text description of this task
    description: str = ""
    # important records to save during process
    process_records: List[str] = []
    # result summary
    result_summary: str = ""
    # mark if this task done
    done: bool = False


"""
Planning is the model for agent planning_use
"""


class Planning(BaseModel):
    items: Dict[str, PlanningItem] = {}

    # return all items
    def list_items(self) -> List[PlanningItem]:
        return [i for i in self.items.values()]

    # return specific item
    def get_item(self, task_id: str) -> Optional[PlanningItem]:
        return self.items.get(task_id)

    # get all the to-dos
    def get_todos(self) -> List[PlanningItem]:
        return [i for i in self.items.values() if not i.done]

    # update an item
    def update_item(self, item_id: str, item: PlanningItem):
        self.items.update({item_id: item})

    def reload_from_file(self, path: str):
        pass

    def save_to_file(self, path: str):
        pass

    # format output, for llm using
    def to_formatted_text(self) -> str:
        pass


"""
Planner is an interface to generate planning for single task
"""


class Planner(ABC):
    @abc.abstractmethod
    async def make_planning(self, task: str) -> Planning:
        pass

    @abc.abstractmethod
    async def astream_make_planning(self, task: str) -> AsyncIterable[Union[str, Planning]]:
        pass

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
from typing import List

from pydantic import BaseModel, Field

from models.planning import Planning, PlanningItem


class PlanningHolder(BaseModel):
    planning: Planning = Field(default_factory=Planning)
    max_plannings: int = 10

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def save_tasks(self, task_descriptions: List[str], worker_names: List[str]) -> str:
        """调用此函数保存计划任务，按顺序传入任务描述和要分配给的团队成员
            Args:
                task_descriptions(List[str]): 任务描述列表
                worker_names(List[str]): 要分配给的团队成员列表（和任务描述列表的顺序对齐）
        """
        next_task_id = 1
        for task_description, worker_name in zip(task_descriptions, worker_names):
            if len(self.planning.items) > self.max_plannings:
                return "保存成功，已经达到任务数量上限"
            self.planning.items.append(PlanningItem(
                id=str(next_task_id),
                description=task_description,
                assign_agent=worker_name,
            ))
            next_task_id += 1

        return "保存成功"

    async def add_task(self, task_description: str, worker_name: str) -> str:
        """当你要向计划中添加一个任务的时候，调用此函数

            Args:
                task_description(str): 任务描述
                worker_name(str): 该任务要分配给哪个团队成员执行
            Returns:
                None
        """
        if len(self.planning.items) > self.max_plannings:
            return f'cannot add more than {self.max_plannings} tasks'
        next_id = len(self.planning.items) + 1
        self.planning.items.append(PlanningItem(
            id=str(next_id),
            description=task_description,
            assign_agent=worker_name,
        ))
        return "task saved."

    async def update_task(self, task_id: str | int, new_description: str, worker_name: str) -> str:
        """当你要调整计划中的一个任务时，调用此函数

            Args:
                task_id(str): 要调整的任务id
                new_description(str): 新的任务描述
                worker_name(str): 该任务要分配给哪个团队成员执行
            Returns:
                None
        """
        task = self.planning.get_item(str(task_id))
        if task:
            if task.done:
                return 'this task is done, could not be modified any more.'
            if task.result_summary:
                # archive
                task.history.append(task.result_summary)
                task.result_summary = ""
            task.description = new_description
            task.assign_agent = worker_name
            self.planning.update_item(task_id, task)

        return "task updated."

    async def mark_task_done(self, task_id: str | int) -> str:
        """当你要标记计划中的一个任务为已完成时，调用此函数

            Args:
                task_id(str): 要标记为完成的任务id
            Returns:
                None
        """
        task = self.planning.get_item(str(task_id))
        if task:
            if not task.result_summary:
                return "because there is no result for this task now, we could not mark it done."
            task.done = True
            self.planning.update_item(task_id, task)

        return "task done."

    async def delete_task(self, task_id: str | int) -> str:
        """当你要删除计划中的一个任务时，调用此函数

            Args:
                task_id(str): 要删除的任务id
            Returns:
                None
        """
        task = self.planning.get_item(str(task_id))
        if task:
            if task.result_summary:
                return "this task is executed, could not be deleted."
            task.done = True
            self.planning.delete_item(str(task_id))

        return "task deleted."

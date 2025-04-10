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
from typing import List, Optional

from pydantic import BaseModel

"""
PlanningItem is a descriptor for single item
"""


class PlanningItem(BaseModel):
    # a specified id to unique mark this task
    id: str = ""
    # the plain text description of this task
    description: str = ""
    # assign agent
    assign_agent: str = ""
    # important records to save during process
    process_records: List[str] = []
    # archived history
    history: List[str] = []
    # result summary
    result_summary: str = ""
    # mark if this task done
    done: bool = False

    def to_markdown_str(self,
                        level: int = 1,
                        include_progress: bool = True,
                        ) -> str:
        md = [f"{'#' * level} [{self.id}] {self.description}"]
        if include_progress:
            md.append(f"{'#' * (level + 1)} 处理记录")
            md.extend([f"  - {record}" for record in self.process_records])
        md.append(f"{'#' * (level + 1)} 执行结果")
        md.append(self.result_summary)
        return "\n".join(md)


"""
Planning is the model for agent planning_use
"""


class Planning(BaseModel):
    root_task: str = ""
    items: List[PlanningItem] = []

    # return all items
    def list_items(self) -> List[PlanningItem]:
        return self.items

    # return specific item
    def get_item(self, task_id: str) -> Optional[PlanningItem]:
        for item in self.items:
            if item.id == task_id:
                return item

    def delete_item(self, task_id: str) -> None:
        for i, item in enumerate(self.items):
            if item.id == task_id:
                del self.items[i]
                return

    # get all the to-dos
    def get_todos(self) -> List[PlanningItem]:
        return [i for i in self.items if not i.done]

    def get_next_todo(self) -> Optional[PlanningItem]:
        for item in self.items:
            if not item.done:
                return item

    # update an item
    def update_item(self, item_id: str, item: PlanningItem):
        for _item in self.items:
            if _item.id == item_id:
                _item.done = item.done
                _item.process_records = item.process_records
                _item.result_summary = item.result_summary
                break

    # format output, for llm prompt using
    def to_markdown_str(
            self,
            level: int = 1,
            with_wrapper: bool = True,
            include_progress: bool = True,
            simplify: bool = False,
    ) -> str:
        md = []
        if with_wrapper:
            md.append("```markdown")

        md += [f"{'#' * level} 任务计划"]

        for item in self.items:
            # 状态图标 + 标题
            status_text = "已完成" if item.done else "未完成"
            if not simplify:
                md.append(
                    f"\n{'#' * (level + 1)} [任务id: {item.id}][状态: {status_text}][执行者：{item.assign_agent}] {item.description}\n")
            else:
                md.append(f"\n {'#' * (level + 1)} [任务id: {item.id}] {item.description} \n")

            if include_progress:
                # 处理记录（带缩进）
                if item.process_records:
                    md.append(f"{'#' * (level + 2)} 处理记录")
                    md.extend([f"  - {record}" for record in item.process_records])
                else:
                    md.append(f"{'#' * (level + 2)} 处理记录 \n\n 暂无")

            # 结果总结
            result = item.result_summary or "暂无"
            md.append(f"{'#' * (level + 2)} 执行结果 \n\n {result}")

        if with_wrapper:
            md.append("```")

        return "\n".join(md)

    def to_dashboard(self) -> str:
        texts = [
            "任务执行情况："
        ]
        for item in self.items:
            texts.append(
                f"{item.id}. [{'已完成' if item.done else '未完成'}][执行者：{item.assign_agent}] <{item.description}>")
        texts.append("----------------")
        for item in self.items:
            if not item.done:
                continue
            texts.append(f"任务 {item.id} 执行结果: \n```\n{item.result_summary}\n```")
            texts.append("----------------")
        return "\n".join(texts)

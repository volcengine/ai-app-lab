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

    # format output, for llm prompt using
    def to_markdown_str(
            self,
            level: int = 1,
            with_wrapper: bool = True,
            include_progress: bool = True,
    ) -> str:
        md = []
        if with_wrapper:
            md.append("```markdown")

        md += [f"{'#' * level} 任务计划"]

        for item_id, item in self.items.items():
            # 状态图标 + 标题
            status_text = "已完成" if item.done else "未完成"
            md.append(f"\n{'#' * (level + 1)} [任务id: {item_id}][状态: {status_text}] {item.description}\n")

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

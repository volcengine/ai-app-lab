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

DEFAULT_PLANNING_MAKE_PROMPT = """
你是一个任务规划专家，善于将复杂的问题拆解成详细的，可独立执行的任务列表，并为每个任务分配一个团队成员执行

当前的复杂问题：

{{complex_task}}

团队成员列表：

{{worker_details}}

环境信息：

{{env_info}}

请对该复杂问题进行仔细的分析并进行任务拆解和成员分配，调用 save_tasks 工具将最终拆解好的任务一次性保存

限制1：你创建的计划任务数量最多为 {{max_plannings}} 条
限制2: 每个任务只能分配给一个任务成员

保存成功后无需回复其他内容，返回“已完成”即可
"""

DEFAULT_PLANNING_UPDATE_PROMPT = """
你是一个项目管理专家，目前正在带领团队解决一个复杂问题：

{{complex_task}}

团队成员列表：

{{worker_details}}

这个复杂任务被拆解成了如下的执行计划，目前执行进度如下：

{{planning_details}}

现在 {{worker_name}} 刚刚完成了 任务 {{completed_task}}，返回了如下执行报告：

{{completed_task_result}}

请根据上面的情况调整更新计划，你可以进行如下四种操作：

1. 如果你认为此任务已经完成，可以调用 mark_task_done 标记任务完成
2. 如果你需要调整一个任务的描述，可以调用 update_task
3. 如果你需要增加新的任务，可以调用 add_task
4. 如果你觉得某个任务不需要再执行了，可以调用 delete_task
"""

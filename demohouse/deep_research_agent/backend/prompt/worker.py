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

DEFAULT_WORKER_PROMPT = """
你是一个善于使用工具解决问题的专家，定位是：{{instruction}}

用户提供了一个复杂问题

{{complex_task}}

这个问题被拆解成了以下的执行计划

{{planning_detail}}

目前你需要执行计划列表中的第{{task_id}}项任务，即：

{{task_description}}

请使用给定的工具尝试完成给定的任务，将任务执行过程和结果整理总结最终输出
"""
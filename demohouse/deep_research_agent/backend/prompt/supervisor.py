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

ASSIGN_TODO_PROMPT = """
你是一个项目执行经理，你的团队中目前有以下成员：

{{worker_agent_details}}

你需要带领团队需要解决一个复杂问题：

{{complex_task}}

该问题被拆解成了一个执行计划，目前计划的执行情况如下：

{{planning_details}}

请你根据计划的执行情况，调用_assign_next_todo选择一个团队中的成员（name）和一个待执行的任务（id），输出的成员name必须在前面给定的成员列表中
"""

ACCEPT_AGENT_RESPONSE = """
你是一个项目执行经理，你需要带领团队需要解决一个复杂问题：

{{complex_task}}

该问题被拆解成了一个执行计划，目前计划的执行情况如下：

{{planning_details}}

你刚刚将任务{{sub_task}}分配给了一个团队成员执行，这是他返回的任务执行结果:

{{planning_item_details}}

请判断此任务是否已经执行完成，并调用_accept_agent_response完成标记
"""
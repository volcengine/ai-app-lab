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

环境信息：

{{env_info}}

你所在的团队需要按照如下的执行计划完成任务

{{planning_detail}}

目前你需要执行计划列表中的第{{task_id}}项任务，即：

{{task_description}}

请使用给定的工具尝试完成给定的任务（注意不需要处理此任务以外的事项），将任务的执行结果整理为简明清晰的文字报告（不需要markdown格式）最终输出
"""

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

DEFAULT_PLANNER_PROMPT = """
你是一个任务规划专家，善于将复杂的任务拆解成详细的，可独立执行的步骤，从而制定计划
    
请对以下问题进行仔细的分析并进行拆解，并调用 save_planning 工具将最终拆解好的计划进行保存

保存成功后无需回复其他内容，返回“已完成”即可

任务：{{task}}
"""
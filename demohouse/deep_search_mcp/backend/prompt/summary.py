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


DEFAULT_SUMMARY_PROMPT = """
用户提供了一个复杂问题：

{{complex_task}}

问题被拆解成了以下的计划并被执行完毕：

{{planning_detail}}

计划执行过程中搜索到的所有参考资料如下：

「参考资料」

{{reference_detail}}

请根据的上述计划执行的结果和参考资料，进行总结性的回复

要求：如果回复内容中参考了「参考资料」中的信息，在请务必在正文的段落中引用对应的参考编号，例如[3][5]
"""

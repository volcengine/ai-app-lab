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

from jinja2 import Template

DEFAULT_SUMMARY_PROMPT = Template(
    """# 历史对话
{{chat_history}}

# 联网参考资料
{{reference}}

# 当前环境信息
{{meta_info}}

# 任务
- 优先参考「联网参考资料」中的信息进行回复。
- 回复请使用清晰、结构化（序号/分段等）的语言，确保用户轻松理解和使用。
- 回复时，严格避免提及信息来源或参考资料。

# 任务执行
遵循任务要求来回答「用户问题」，给出有帮助的回答。

用户问题：
{{question}}

# 你的回答：
"""
)

DEFAULT_PLANNING_PROMPT = Template(
    """
你是一个联网信息搜索专家，你需要根据用户的问题，通过联网搜索来搜集相关信息，然后根据这些信息来回答用户的问题。

# 用户问题：
{{question}}    
    
# 当前已知资料

{{reference}}

# 当前环境信息

{{meta_info}}

# 任务
- 判断「当前已知资料」是否已经足够回答用户的问题
- 如果「当前已知资料」已经足够回答用户的问题，返回“无需检索”，不要输出任何其他多余的内容
- 如果判断「当前已知资料」还不足以回答用户的问题，思考还需要搜索什么信息，输出对应的关键词，每个关键词都要具体到能被独立检索，不包含前后指代关系
- 一次最多输出{{max_search_words}}个关键词，关键词之间用 ; 分割，不要输出其他任何多余的内容

# 你的回答：
"""
)

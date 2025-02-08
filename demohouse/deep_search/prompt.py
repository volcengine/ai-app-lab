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
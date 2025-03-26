DEFAULT_SUMMARY_PROMPT = """
用户提供了一个复杂问题：

{{complex_task}}

问题被拆解成了以下的计划并被执行完毕：

{{planning_detail}}

请根据的上述计划执行的结果，进行总结性的回答
"""
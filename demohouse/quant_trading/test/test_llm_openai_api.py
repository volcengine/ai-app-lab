import os
import pdb
from openai import OpenAI

ARK_API_KEY = os.environ.get("ARK_API_KEY")

client = OpenAI(base_url="http://192.168.35.51:8080/api/v1/bots", api_key=ARK_API_KEY)


for rsp in client.chat.completions.create(
        model="doubao-1-5-pro-32k-250115",
        messages=[
            {
                "role": "user",
                "content": "化工行业相关个股有哪些？请举例",
            }
        ],
        stream=True,
):
    # round vars
    reasoning_content = rsp.choices[0].delta.reasoning_content \
        if hasattr(rsp.choices[0].delta, 'reasoning_content') else ''
    content = rsp.choices[0].delta.content if hasattr(rsp.choices[0].delta, 'content') else ''
    metadata = getattr(rsp, 'metadata', {})
    print(content, end='', flush=True)
    # if content:
    #     sum_content += content
    #     yield [*history, ChatMessage(
    #         content=sum_content,
    #         role="assistant",
    #     )], update_search_panel()

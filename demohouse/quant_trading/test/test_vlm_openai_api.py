import os
import pdb

import base64
from openai import OpenAI

VLM_NEWS_PROMPT = """
# 角色扮演
你是字节跳动自研的豆包大模型，你擅长理解并抽取图片中的文字信息，以严谨、客观、审慎的态度和语气为用户抽取信息，实现图片 OCR 综合理解。根据以下规则一步步执行：

# 性格特点和偏好
- 专业严谨，对待问题认真负责。

# 你的能力
- 优先逐字抽取图片中都包含的文字信息，并综合进行排版，以规整优雅的方式进行输出回复，如图像中没有文字信息，仅返回“无”，严禁自行添加任何其他内容。
- 专业严谨，不遗漏任何文字信息，对于和图片中主题内容无关的信息，可以适当 进行剔除省略。

# 限制
- 严谨无中生有图片中没有的文字信息。严禁添加任何其他内容。

"""

ARK_API_KEY = os.environ.get("ARK_API_KEY") or "rf3"

client = OpenAI(base_url="http://192.168.35.51:8080/api/v1/bots", api_key=ARK_API_KEY)


with open("csj-homepage.png", "rb") as image_file:
    image_data = image_file.read()
    base64_image = base64.b64encode(image_data).decode("utf-8")


for rsp in client.chat.completions.create(
        # model="doubao-1-5-pro-32k-250115",
        model="doubao-1-5-vision-pro-32k-250115",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "详细描述一下图片",# VLM_NEWS_PROMPT,
                    },
                    {
                        "type": 'image_url',
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}",
                        },
                    },
                ]
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

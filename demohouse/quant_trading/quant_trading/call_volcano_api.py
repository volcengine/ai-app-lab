import os
from volcenginesdkarkruntime import Ark



def call_multimodal_api(image_base64):
    # 调用 多模态视觉理解 API
    # 请确保您已将 API Key 存储在环境变量 ARK_API_KEY 中
    # 初始化Ark客户端，从环境变量中读取您的API Key
    client = Ark(
        # 此为默认路径，您可根据业务所在地域进行配置
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        # 从环境变量中获取您的 API Key。此为默认方式，您可根据需要进行修改
        api_key=os.environ.get("ARK_API_KEY"),
    )

    response = client.chat.completions.create(
        # 指定您创建的方舟推理接入点 ID，此处已帮您修改为您的推理接入点 ID
        model="doubao-1-5-vision-pro-32k-250115",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "这图片内容是什么？"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_base64  # or  image url
                        },
                    },
                ],
            }
        ],

    )

    print(response.choices[0])



def call_llm_api(input_text):

    # 请确保您已将 API Key 存储在环境变量 ARK_API_KEY 中
    # 初始化Ark客户端，从环境变量中读取您的API Key
    client = Ark(
        # 此为默认路径，您可根据业务所在地域进行配置
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        # 从环境变量中获取您的 API Key。此为默认方式，您可根据需要进行修改
        api_key=os.environ.get("ARK_API_KEY"),
    )

    # Non-streaming:
    # print("----- standard request -----")
    completion = client.chat.completions.create(
    # 指定您创建的方舟推理接入点 ID，此处已帮您修改为您的推理接入点 ID
        model="doubao-1-5-pro-32k-250115",
        messages=[
            {"role": "system", "content": "你是人工智能助手."},
            {"role": "user", "content": input_text},
        ],
    )
    # print(completion.choices[0].message.content)
    return completion.choices[0].message.content

    # # Streaming:
    # print("----- streaming request -----")
    # stream = client.chat.completions.create(
    #     model="doubao-1-5-pro-32k-250115",
    #     messages=[
    #         {"role": "system", "content": "你是人工智能助手."},
    #         {"role": "user", "content": "常见的十字花科植物有哪些？"},
    #     ],
    #     # 响应内容是否流式返回
    #     stream=True,
    # )
    # for chunk in stream:
    #     if not chunk.choices:
    #         continue
    #     print(chunk.choices[0].delta.content, end="")
    # print()


def call_llm_browsing_api():

    # 请确保您已将 API Key 存储在环境变量 ARK_API_KEY 中
    # 初始化Ark客户端，从环境变量中读取您的API Key
    client = Ark(
        # 此为默认路径，您可根据业务所在地域进行配置
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        # 从环境变量中获取您的 API Key。此为默认方式，您可根据需要进行修改
        api_key=os.environ.get("ARK_API_KEY"),
    )

    # Non-streaming:
    print("----- standard request -----")
    completion = client.chat.completions.create(
    # 指定您创建的方舟推理接入点 ID，此处已帮您修改为您的推理接入点 ID
        model="doubao-pro-32k-browsing-241115",
        messages=[
            {"role": "system", "content": "你是人工智能助手."},
            {"role": "user", "content": "jionlp是个什么东西？主页是什么链接",
            #  "tool_calls":
            },
        ],
    )
    print(completion.choices[0].message.content)

    """
    # Streaming:
    print("----- streaming request -----")
    stream = client.chat.completions.create(
        model="doubao-pro-32k-browsing-241115",
        messages=[
            {"role": "system", "content": "你是人工智能助手."},
            {"role": "user", "content": "常见的十字花科植物有哪些？"},
        ],
        # 响应内容是否流式返回
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        print(chunk.choices[0].delta.content, end="")
    print()"
    """


if __name__ == "__main__":
    # call_llm_browsing_api()
    print(input_text)
    call_llm_api(input_text)

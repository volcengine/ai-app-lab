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

import asyncio
from typing import Any

from pydantic import BaseModel
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.context import TruncationStrategy

from arkitect.core.client.http import default_ark_client
from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import approval_tool_hook
from arkitect.types.llm.model import ArkContextParameters


class ArkToolResponse(BaseModel):
    status_code: int | None = None

    data: Any | None = None


async def link_reader(url_list: list[str]):
    """
    当你需要获取网页、pdf、抖音视频内容时，使用此工具。可以获取url链接下的标题和内容。

    examples: {"url_list":["abc.com", "xyz.com"]}

    Args:
        url_list (list[str]): 需要解析网页链接,最多3个,以列表返回
    """
    body = {
        "action_name": "LinkReader",
        "tool_name": "LinkReader",
        "parameters": {"url_list": url_list},
    }
    client: AsyncArk = default_ark_client()
    response = await client.post(
        path="/tools/execute", body=body, cast_to=ArkToolResponse
    )
    return response


async def main():
    # human in the loop example
    ctx = Context(model="doubao-1.5-pro-32k-250115", tools=[link_reader])
    await ctx.init()
    ctx.add_pre_tool_call_hook(approval_tool_hook)
    while True:
        question = input("用户输入：")
        if question == "exit":
            break
        completion = await ctx.completions.create(
            [{"role": "user", "content": question}], stream=True
        )
        async for chunk in completion:
            if chunk.choices:
                print(chunk.choices[0].delta.content, end="")
        print()

    # context api example
    ctx2 = Context(
        model="doubao-1.5-pro-32k-250115",
        context_parameters=ArkContextParameters(
            messages=[{"role": "system", "content": "You are an ai assistant."}],
            truncation_strategy=TruncationStrategy(
                type="last_history_tokens",
            ),
        ),
    )
    await ctx2.init()

    while True:
        question = input("用户输入：")
        if question == "exit":
            break
        completion = await ctx2.completions.create(
            [
                {"role": "user", "content": question},
            ],
            stream=True,
        )
        async for chunk in completion:
            if chunk.choices:
                print(chunk.choices[0].delta.content, end="")
        print()


if __name__ == "__main__":
    asyncio.run(main())

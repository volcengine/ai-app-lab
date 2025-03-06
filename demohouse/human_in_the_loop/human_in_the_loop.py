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

from volcenginesdkarkruntime.types.context import TruncationStrategy

from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import approval_tool_hook
from arkitect.core.component.llm.model import ArkMessage, ArkContextParameters
from arkitect.core.component.tool.pool import tool_key
from arkitect.core.component.tool.schema.linkreader import LinkReader


async def main():
    link_reader = LinkReader()
    link_reader_key = tool_key(link_reader.action_name, link_reader.tool_name)
    # human in the loop example
    async with (Context(model="<MODEL_NAME>", tools={link_reader_key: link_reader}) as ctx):
        ctx.tools.get(link_reader_key).hooks.append(approval_tool_hook)
        while True:
            question = input()
            if question == "exit":
                break
            completion = await ctx.completions.create([
                {
                    "role": "user",
                    "content": question
                }
            ], stream=True)
            async for chunk in completion:
                if chunk.choices:
                    print(chunk.choices[0].delta.content, end="")
            print()

    # context api example
    async with Context(model="<MODEL-NAME>", context_parameters=ArkContextParameters(
            messages=[
                {
                    "role": "system",
                    "content": "You are an ai assistant."
                }
            ],
            truncation_strategy=TruncationStrategy(
                type="last_history_tokens",
            )
    )) as ctx:
        while True:
            question = input()
            if question == "exit":
                break
            completion = await ctx.completions.create([
                {
                    "role": "user",
                    "content": question
                },
            ], stream=True)
            async for chunk in completion:
                if chunk.choices:
                    print(chunk.choices[0].delta.content, end="")
            print()


if __name__ == '__main__':
    asyncio.run(main())

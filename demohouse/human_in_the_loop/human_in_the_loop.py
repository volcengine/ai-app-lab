import asyncio

from volcenginesdkarkruntime.types.context import TruncationStrategy

from arkitect.core.component.llm.context import Context
from arkitect.core.component.llm.model import ArkMessage, ArkContextParameters
from arkitect.core.component.tool.manifest import ArkToolRequest
from arkitect.core.component.tool.pool import tool_key
from arkitect.core.component.tool.schema.linkreader import LinkReader


async def approve(req: ArkToolRequest) -> ArkToolRequest:
    print(req)
    y_or_n = input("input Y to approve\n")
    if y_or_n == "Y":
        return req
    else:
        raise ValueError("tool call parameters not approved")


async def main():
    link_reader = LinkReader()
    link_reader.pre_tool_call_hook.append(approve)
    # human in the loop example
    async with Context(model="<MODEL_NAME>") as ctx:
        while True:
            question = input()
            if question == "exit":
                break
            async for chunk in ctx.astream([
                ArkMessage(role="user", content=question)
            ], functions={
                tool_key(link_reader.action_name, link_reader.tool_name): link_reader
            }):
                if chunk.choices:
                    print(chunk.choices[0].delta.content, end="")
            print()

    # context api example
    async with Context(model="<MODEL_NAME>", context_parameters=ArkContextParameters(
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant."
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
            async for chunk in ctx.astream([
                ArkMessage(role="user", content=question)
            ]):
                if chunk.choices:
                    print(chunk.choices[0].delta.content, end="")
            print()


if __name__ == '__main__':
    asyncio.run(main())

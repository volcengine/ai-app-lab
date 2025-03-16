import json
import logging
import os
import time
from typing import AsyncIterable
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import (
    ArkChatRequest,
    ArkChatParameters,
    ArkChatCompletionChunk,
    BotUsage,
    ActionDetail,
    ToolDetail,
)
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from arkitect.core.component.context.context import Context

from arkitect.core.runtime import Response

from arkitect.core.component.context.model import State

from arkitect.types.llm.model import ChatCompletionMessageToolCallParam
from vdb import vector_search

logger = logging.getLogger(__name__)

DOUBAO_VLM_ENDPOINT = "doubao-1-5-pro-32k-250115"


@task()
def get_vector_search_result_chunk(result: str) -> ArkChatCompletionChunk:
    return ArkChatCompletionChunk(
        id="",
        created=int(time.time()),
        model="",
        object="chat.completion.chunk",
        choices=[],
        bot_usage=BotUsage(
            action_details=[
                ActionDetail(
                    name="vector_search",
                    count=1,
                    tool_details=[
                        ToolDetail(
                            name="vector_search", input=None, output=json.loads(result)
                        )
                    ],
                )
            ]
        ),
    )


@task()
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[ArkChatCompletionChunk | ChatCompletionChunk]:
    parameters = ArkChatParameters(**request.__dict__)
    image_urls = [
        content.get("image_url", {}).get("url", "")
        for message in request.messages
        if isinstance(message.content, list)
        for content in message.content
        if content.get("image_url", {}).get("url", "")
    ]
    image_url = image_urls[-1] if len(image_urls) > 0 else ""

    # only search for relevant product
    if request.metadata and request.metadata.get("search"):
        result = await vector_search("", image_url)
        yield get_vector_search_result_chunk(result)
        return

    async def modify_url_hook(
        state: State, param: ChatCompletionMessageToolCallParam
    ) -> ChatCompletionMessageToolCallParam:
        arguments = json.loads(param["function"]["arguments"])
        arguments["image_url"] = image_url
        param["function"]["arguments"] = json.dumps(arguments)
        return param

    async with Context(
        model=DOUBAO_VLM_ENDPOINT, tools=[vector_search], parameters=parameters
    ) as ctx:
        ctx.tool_hooks.update(vector_search=[modify_url_hook])
        stream = await ctx.completions.create(
            messages=[m.model_dump() for m in request.messages], stream=True
        )
        tool_call = False
        async for chunk in stream:
            if tool_call and chunk.choices:
                tool_result = ctx.get_latest_message()
                yield get_vector_search_result_chunk(
                    str(tool_result.get("content", ""))
                )
                tool_call = False
            yield chunk
            if chunk.choices and chunk.choices[0].finish_reason == "tool_calls":
                tool_call = True


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
    )

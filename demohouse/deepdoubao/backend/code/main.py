"""
Deepdoubao
"""

import logging
import os
from typing import AsyncIterable, Union

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    Response, ArkMessage,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task

logger = logging.getLogger(__name__)

DEEPSEEK_R1_ENDPOINT = "<ENDPOINT_ID_FOR_DEEPSEEK_R1>"
DOUBAO_ENDPOINT = "<ENDPOINT_ID_FOR_DOUBAO>"


@task(watch_io=False)
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    parameters = ArkChatParameters(**request.__dict__)

    deepseek = BaseChatLanguageModel(
        endpoint_id=DEEPSEEK_R1_ENDPOINT,
        messages=request.messages,
        parameters=parameters,
    )
    reasoning_content = ""
    async for chunk in deepseek.astream():
        if chunk.choices[0].delta.reasoning_content:
            if request.stream:
                yield chunk
            reasoning_content += chunk.choices[0].delta.reasoning_content
        elif chunk.choices[0].delta.content:
            break

    doubao = BaseChatLanguageModel(
        endpoint_id=DOUBAO_ENDPOINT,
        messages=request.messages + [
            ArkMessage(role="assistant", content="思考过程如下：\n" + reasoning_content + "\n请根据以上思考过程，给出完整的回答：\n")
        ],
        parameters=parameters,
    )
    if request.stream:
        async for chunk in doubao.astream():
            yield chunk
    else:
        response = await doubao.arun()
        response.choices[0].message.reasoning_content = reasoning_content
        yield response

@task(watch_io=False)
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
        trace_on=False,
        clients={},
    )

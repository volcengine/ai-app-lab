"""
默认llm逻辑
"""
import os
import pdb
from typing import AsyncIterable, List, Optional, Tuple, Union


from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
    Response,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task

import config
from prompt import VLM_OCR_PROMPT

endpoint_id = "ep-m-20250316221825-6fglr"  # https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint

# model_name = "doubao-pro-32k-browsing-241115"
model_name = "doubao-pro-32k-241215"


# @task()
async def chat_with_llm(
    request: ArkChatRequest,
    # parameters: ArkChatParameters
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:

    parameters = ArkChatParameters(**request.__dict__)
    llm = BaseChatLanguageModel(
        endpoint_id=endpoint_id,
        messages=request.messages,
        parameters=parameters,
    )
    if request.stream:
        async for resp in llm.astream():
            yield resp
    else:
        yield await llm.arun()


    # iterator = llm.astream()
    # first_resp = await iterator.__anext__()

    # async def stream_llm_outputs():
    #     yield first_resp
    #     async for resp in iterator:
    #         yield resp
    # pdb.set_trace()
    # return True, stream_llm_outputs()


@task()
async def chat_with_vlm(
    request: ArkChatRequest,
    parameters: ArkChatParameters,
) -> Tuple[bool, Optional[AsyncIterable[ArkChatCompletionChunk]]]:

    vlm = BaseChatLanguageModel(
        endpoint_id=config.VLM_MODEL_ENDPOINT_ID,
        messages=[ArkMessage(role="system", content=VLM_OCR_PROMPT)]
        + [request.messages[-1]],  # [ArkMessage(role="user", content=VLM_NEWS_PROMPT)] +
        parameters=parameters,
    )
    if request.stream:
        async for resp in vlm.astream():
            # print("resp: ", resp)
            yield resp
    else:
        yield await llm.arun()

    # iterator = vlm.astream()
    # message = ""
    # first_resp = await iterator.__anext__()
    # print("first_resp: ", first_resp)
    # if first_resp.choices and first_resp.choices[0].delta.content != "":
    #     message += first_resp.choices[0].delta.content
    # second_resp = await iterator.__anext__()
    # print("second_resp: ", second_resp)
    # if second_resp.choices and second_resp.choices[0].delta.content != "":
    #     message += second_resp.choices[0].delta.content
    # if message.startswith("不知道"):
    #     return False, None

    # async def stream_vlm_outputs():
    #     yield first_resp
    #     yield second_resp
    #     async for resp in iterator:
    #         yield resp

    # return True, stream_vlm_outputs()


@task()
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    # pdb.set_trace()
    # If a list is passed and the last item is an image
    # Use VLM to summarize the image asynchronously and return immediately
    is_image = (
        isinstance(request.messages[-1].content, list)
        and (request.messages[-1].content[-1].type == 'image_url')
    )

    parameters = ArkChatParameters(**request.__dict__)
    if is_image:
        # pdb.set_trace()
        if request.stream:
            async for reasoning_chunk in chat_with_vlm(request, parameters):
                yield reasoning_chunk

        else:
            yield await chat_with_llm(request)
        # vlm_task = chat_with_vlm(request, parameters)

        # # return
        # can_response, vlm_iter = await vlm_task
        # yield await vlm_iter
    else:
    # Use LLM to answer user's question
    # Received a response iterator from LLM
        if request.stream:
            async for reasoning_chunk in chat_with_llm(request):
                yield reasoning_chunk

        else:
            # pdb.set_trace()
            yield await chat_with_llm(request)


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp
        # yield resp.choices[0].delta.content


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="server",
        port=int(port) if port else 8080,
        health_check_path="/v1/ping",
        endpoint_path="/api/v1/bots/chat/completions",
        clients={},
    )

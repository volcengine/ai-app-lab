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

"""
Video Analyser: Realtime vision and speech analysis
"""

import asyncio
import logging
import os
from typing import AsyncIterable, List, Optional, Tuple, Union

import prompt
import utils
from config import LLM_ENDPOINT, VLM_ENDPOINT, TTS_ACCESS_TOKEN, TTS_APP_ID

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
    ChatCompletionMessageTextPart,
    Response,
)
from arkitect.core.component.tts import (
    AudioParams,
    ConnectionParams,
    AsyncTTSClient,
    create_bot_audio_responses,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.utils.context import get_headers, get_reqid

FRAME_DESCRIPTION_PREFIX = "视频帧描述："
LAST_HISTORY_MESSAGES = 180  # truncate history messages to 180

logger = logging.getLogger(__name__)


@task(watch_io=False)
async def get_request_messages_for_llm(
    contexts: utils.Storage,
    context_id: str,
    request: ArkChatRequest,
    prompt: str,
) -> List[ArkMessage]:
    request_messages = await contexts.get_history(context_id)
    if isinstance(request.messages[-1].content, list):
        assert isinstance(
            request.messages[-1].content[0], ChatCompletionMessageTextPart
        )
        text = request.messages[-1].content[0].text
    else:
        text = request.messages[-1].content
    request_messages = request_messages + [ArkMessage(role="user", content=text)]
    request_messages = request_messages[-LAST_HISTORY_MESSAGES:]
    return [ArkMessage(role="system", content=prompt)] + request_messages


@task(watch_io=False)
async def chat_with_vlm(
    request: ArkChatRequest,
    parameters: ArkChatParameters,
) -> Tuple[bool, Optional[AsyncIterable[ArkChatCompletionChunk]]]:
    vlm = BaseChatLanguageModel(
        endpoint_id=VLM_ENDPOINT,
        messages=[ArkMessage(role="system", content=prompt.VLM_CHAT_PROMPT)]
        + [request.messages[-1]],
        parameters=parameters,
    )

    iterator = vlm.astream()
    message = ""
    first_resp = await iterator.__anext__()
    if first_resp.choices and first_resp.choices[0].delta.content != "":
        message += first_resp.choices[0].delta.content
    second_resp = await iterator.__anext__()
    if second_resp.choices and second_resp.choices[0].delta.content != "":
        message += second_resp.choices[0].delta.content
    if message.startswith("不知道"):
        return False, None

    async def stream_vlm_outputs():
        yield first_resp
        yield second_resp
        async for resp in iterator:
            yield resp

    return True, stream_vlm_outputs()


@task(watch_io=False)
async def llm_answer(
    contexts, context_id, request, parameters: ArkChatParameters
) -> Tuple[bool, Optional[AsyncIterable[ArkChatCompletionChunk]]]:
    request_messages = await get_request_messages_for_llm(
        contexts, context_id, request, prompt.LLM_PROMPT
    )
    llm = BaseChatLanguageModel(
        endpoint_id=LLM_ENDPOINT,
        messages=request_messages,
        parameters=parameters,
    )

    iterator = llm.astream()
    first_resp = await iterator.__anext__()

    async def stream_llm_outputs():
        yield first_resp
        async for resp in iterator:
            yield resp

    return True, stream_llm_outputs()


@task(watch_io=False)
async def chat_with_llm(
    contexts: utils.Storage,
    request: ArkChatRequest,
    parameters: ArkChatParameters,
    context_id: str,
) -> Tuple[bool, Optional[AsyncIterable[ArkChatCompletionChunk]]]:
    response_task = asyncio.create_task(
        llm_answer(contexts, context_id, request, parameters)
    )
    logger.info("llm can respond")
    return await response_task


@task(watch_io=False)
async def chat_with_branches(
    contexts: utils.Storage,
    request: ArkChatRequest,
    parameters: ArkChatParameters,
    context_id: str,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    """
    Launch two tasks to attempt asnwering with/without long term memory

    If VLM can answer with current frame only, use VLM's answer.
    If VLM cannot answer, use the answer with long term memory (from LLM)
    """
    vlm_task = asyncio.create_task(chat_with_vlm(request, parameters))
    llm_task = asyncio.create_task(
        chat_with_llm(contexts, request, parameters, context_id)
    )
    can_response, vlm_iter = await vlm_task
    if can_response:
        logger.info("vlm responded, using vlm's anwser")
        llm_task.cancel()
        return vlm_iter
    else:
        can_response, llm_iter = await llm_task
        logger.info(f"type I got from llm: {type(llm_iter)}")
        return llm_iter


@task(watch_io=False)
async def summarize_image(
    contexts: utils.Storage,
    request: ArkChatRequest,
    parameters: ArkChatParameters,
    context_id: str,
):
    """
    Summarize the image and append the summary to the context.
    """
    request_messages = [
        ArkMessage(role="system", content=prompt.VLM_PROMPT)
    ] + request.messages
    vlm = BaseChatLanguageModel(
        endpoint_id=VLM_ENDPOINT,
        messages=request_messages,
        parameters=parameters,
    )
    resp = await vlm.arun()
    message = resp.choices[0].message.content
    message = FRAME_DESCRIPTION_PREFIX + message
    await contexts.append(context_id, ArkMessage(role="assistant", content=message))


@task(watch_io=False)
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    # local in-memory storage should be changed to other storage in production
    context_id: Optional[str] = get_headers().get("X-Context-Id", None)
    assert context_id is not None
    contexts: utils.Storage = utils.CoroutineSafeMap.get_instance_sync()
    if not await contexts.contains(context_id):
        await contexts.set(context_id, utils.Context())

    # If a list is passed and the first text is empty
    # Use VLM to summarize the image asynchronously and return immediately
    is_image = (
        isinstance(request.messages[-1].content, list)
        and isinstance(request.messages[-1].content[0], ChatCompletionMessageTextPart)
        and request.messages[-1].content[0].text == ""
    )
    parameters = ArkChatParameters(**request.__dict__)
    if is_image:
        _ = asyncio.create_task(
            summarize_image(contexts, request, parameters, context_id)
        )
        return

    # Initialize TTS connection asynchronously before launching LLM request to reduce latency
    tts_client = AsyncTTSClient(
        connection_params=ConnectionParams(
            speaker="zh_female_tianmeixiaoyuan_moon_bigtts",
            audio_params=AudioParams(
                format="mp3",
                sample_rate=24000,
            ),
        ),
        access_key=TTS_ACCESS_TOKEN,
        app_key=TTS_APP_ID,
        conn_id=get_reqid(),
        log_id=get_reqid(),
    )
    connection_task = asyncio.create_task(tts_client.init())

    # Use LLM and VLM to answer user's question
    # Received a response iterator from LLM or VLM
    response_iter = await chat_with_branches(contexts, request, parameters, context_id)
    await connection_task
    message = ""
    tts_stream_output = tts_client.tts(response_iter, stream=request.stream)
    async for resp in create_bot_audio_responses(tts_stream_output, request):
        if isinstance(resp, ArkChatCompletionChunk):
            if len(resp.choices) > 0 and hasattr(resp.choices[0].delta, "audio"):
                message += resp.choices[0].delta.audio.get("transcript", "")
        else:
            if len(resp.choices) > 0 and resp.choices[0].message.audio:
                message += resp.choices[0].message.audio.transcript
        yield resp
    await tts_client.close()
    text = ""
    if isinstance(request.messages[-1].content, list) and isinstance(
        request.messages[-1].content[0], ChatCompletionMessageTextPart
    ):
        text = request.messages[-1].content[0].text
    elif isinstance(request.messages[-1].content, str):
        text = request.messages[-1].content
    await contexts.append(
        context_id,
        ArkMessage(role="user", content=text),
    )
    await contexts.append(context_id, ArkMessage(role="assistant", content=message))


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
        clients={},
    )

# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import base64
import time
from typing import AsyncIterable, Union

import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk
from volcenginesdkarkruntime.types.chat.chat_completion import (
    ChatCompletionMessage,
    Choice,
)
from volcenginesdkarkruntime.types.chat.chat_completion_audio import ChatCompletionAudio

from arkitect.types.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)
from arkitect.utils.context import get_client_reqid, get_reqid

from .base import TTSResponseChunk


def _get_first_chunk(request: ArkChatRequest) -> ArkChatCompletionChunk:
    return ArkChatCompletionChunk(
        id=get_reqid(),
        created=int(time.time()),
        model=request.model,
        choices=[
            completion_chunk.Choice(
                delta=completion_chunk.ChoiceDelta(
                    role="assistant",
                ),
                index=0,
            )
        ],
        object="chat.completion.chunk",
    )


def _get_normal_chunk(
    request: ArkChatRequest,
    chunk: TTSResponseChunk,
    first_audio_chunk: bool,
    first_transcript_chunk: bool,
    audio_id: str,
) -> ArkChatCompletionChunk:
    audio_chunk = {}
    if first_audio_chunk or first_transcript_chunk:
        audio_chunk["id"] = audio_id
    if chunk.audio:
        audio_chunk["data"] = base64.b64encode(chunk.audio).decode("utf-8")
    if chunk.transcript:
        audio_chunk["transcript"] = chunk.transcript
    return ArkChatCompletionChunk(
        id="1",
        created=int(time.time()),
        model=request.model,
        choices=[
            completion_chunk.Choice(
                delta=completion_chunk.ChoiceDelta(
                    audio=audio_chunk,
                ),
                index=0,
            )
        ],
        object="chat.completion.chunk",
    )


def _get_last_chunk(request: ArkChatRequest) -> ArkChatCompletionChunk:
    return ArkChatCompletionChunk(
        id=get_reqid(),
        created=int(time.time()),
        model=request.model,
        choices=[
            completion_chunk.Choice(
                delta=completion_chunk.ChoiceDelta(
                    audio={
                        "expires_at": int(time.time()),
                    },
                ),
                index=0,
            )
        ],
        object="chat.completion.chunk",
    )


async def _stream_bot_response_handler(
    tts_stream: AsyncIterable[TTSResponseChunk], request: ArkChatRequest, audio_id: str
) -> AsyncIterable[ArkChatCompletionChunk]:
    first_chunk = True
    first_audio_chunk = True
    first_transcript_chunk = True
    async for chunk in tts_stream:
        if first_chunk:
            yield _get_first_chunk(request)
            first_chunk = False
        if chunk.audio:
            yield _get_normal_chunk(
                request=request,
                chunk=chunk,
                first_audio_chunk=first_audio_chunk,
                first_transcript_chunk=first_transcript_chunk,
                audio_id=audio_id,
            )
            first_audio_chunk = False
        if chunk.transcript:
            yield _get_normal_chunk(
                request=request,
                chunk=chunk,
                first_audio_chunk=first_audio_chunk,
                first_transcript_chunk=first_transcript_chunk,
                audio_id=audio_id,
            )
            first_transcript_chunk = False

    yield _get_last_chunk(request)


async def _bot_response_handler(
    tts_stream: AsyncIterable[TTSResponseChunk], request: ArkChatRequest, audio_id: str
) -> AsyncIterable[ArkChatResponse]:
    audio_part: bytes = b""
    audio_transcript: str = ""
    async for chunk in tts_stream:
        if chunk.audio:
            audio_part += chunk.audio
        if chunk.transcript:
            audio_transcript += chunk.transcript
    yield ArkChatResponse(
        id=get_reqid(),
        model=request.model,
        choices=[
            Choice(
                index=0,
                message=ChatCompletionMessage(
                    role="assistant",
                    audio=ChatCompletionAudio(
                        id=audio_id,
                        expires_at=int(time.time()),
                        data=base64.b64encode(audio_part).decode("utf-8"),
                        transcript=audio_transcript,
                    ),
                ),
                finish_reason="stop",
            ),
        ],
        object="chat.completion",
        created=int(time.time()),
    )


async def create_bot_audio_responses(
    tts_stream: AsyncIterable[TTSResponseChunk], request: ArkChatRequest
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    audio_id = "audio_" + str(get_client_reqid())
    if request.stream:
        async for chunk in _stream_bot_response_handler(tts_stream, request, audio_id):
            yield chunk
    else:
        async for response in _bot_response_handler(tts_stream, request, audio_id):
            yield response

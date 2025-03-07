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
import json
import time
from typing import AsyncIterable, List

import tos
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import (
    Choice,
    ChoiceDelta,
)

from app.clients.tos import TOSClient
from app.constants import (
    ARTIFACT_TOS_BUCKET,
    DEFAULT_AUDIO_TONE,
    MAX_STORY_BOARD_NUMBER,
    TTS_ACCESS_TOKEN,
    TTS_APP_ID,
    VALID_TONES,
)
from app.generators.base import Generator
from app.generators.phase import Phase
from app.message_utils import extract_and_parse_dict_from_message
from app.mode import Mode
from app.models.audio import Audio
from app.output_parsers import OutputParser
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)
from arkitect.core.component.tts import (
    AsyncTTSClient,
    AudioParams,
    ConnectionParams,
)
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR, INFO
from arkitect.utils.context import get_reqid, get_resource_id


class AudioGenerator(Generator):
    output_parser: OutputParser
    request: ArkChatRequest
    tos_client: TOSClient
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.tos_client = TOSClient()
        self.tts_client = AsyncTTSClient(
            access_key=TTS_ACCESS_TOKEN,
            app_key=TTS_APP_ID,
            connection_params=ConnectionParams(
                audio_params=AudioParams(format="mp3", sample_rate=24000),
            ),
        )
        self.output_parser = OutputParser(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # extract character tones to be used for character audio generation
        tones = self.output_parser.get_tones()

        if not tones:
            ERROR("tones not found")
            raise InvalidParameter("messages", "tones not found")

        if len(tones) > MAX_STORY_BOARD_NUMBER:
            ERROR("line count exceed limit")
            raise InvalidParameter("messages", "line count exceed limit")

        # user request can include audios field containing a list of Audios they don't want regenerated
        # handle case when some assets are already provided, only a subset of assets needs to be generated
        generated_audios: List[Audio] = []
        if self.mode == Mode.REGENERATION:
            dict_content = extract_and_parse_dict_from_message(
                self.request.messages[-1].content
            )
            audios_json = dict_content.get("audios", [])
            for ri in audios_json:
                audio = Audio.model_validate(ri)
                if audio.url:
                    generated_audios.append(audio)

        INFO(f"generated_audios: {generated_audios}")

        # send first stream
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.AUDIO.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        content = {"audios": [audio.model_dump() for audio in generated_audios]}

        # generate a list of character audios, skips audios in generated_audios
        generated_audios_indexes = set([a.index for a in generated_audios])
        for t in tones:
            if t.index not in generated_audios_indexes:
                url = await self._generate_audio(t.line, t.tone, t.index)
                content["audios"].append(
                    Audio(
                        index=t.index,
                        url=url,
                    ).model_dump()
                )

        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(content=f"{json.dumps(content)}\n\n"),
                )
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=1,
                    finish_reason="stop",
                    delta=ChoiceDelta(content=""),
                )
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

    async def _generate_audio(self, prompt: str, tone: str, index: int) -> str:
        try:
            if tone not in VALID_TONES:
                tone = DEFAULT_AUDIO_TONE

            self.tts_client.connection_params.speaker = tone

            # wait for tts_client to initialise
            t = asyncio.create_task(self.tts_client.init())
            await t

            # because stream=False, only one chunk will be yielded in tts_stream_output
            audio_bytes = None
            tts_stream_output = self.tts_client.tts(prompt, stream=False)
            async for chunk in tts_stream_output:
                audio_bytes = chunk.audio

            await self.tts_client.close()

            # upload audio to tos as an mp3 file
            # media files are uploaded to TOS to avoid occupying too much local memory
            # in the event when a large umber of requests are made in parallel
            tos_bucket_name = ARTIFACT_TOS_BUCKET
            tos_object_key = f"{get_reqid()}/{Phase.AUDIO.value}/{index}.mp3"
            self.tos_client.put_object(tos_bucket_name, tos_object_key, audio_bytes)

            output = self.tos_client.pre_signed_url(tos_bucket_name, tos_object_key)
            return output.signed_url
        except tos.exceptions.TosClientError as e:
            ERROR(f"fail with tos client error, message:{e.message}, cause: {e.cause}")
            return "failed to generate audio"
        except tos.exceptions.TosServerError as e:
            ERROR(
                f"fail with tos server error, code:{e.code}, message: {e.message}, request_id: {e.request_id}"
            )
            return "failed to generate audio"
        except Exception as e:
            ERROR(f"failed to generate audio, error: {e}")
            return "failed to generate audio"

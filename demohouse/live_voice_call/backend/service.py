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

from typing import AsyncIterable, List, Union

from arkitect.core.component.asr import ASRFullServerResponse, AsyncASRClient
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import ArkMessage
from arkitect.core.component.tts import AsyncTTSClient, AudioParams, ConnectionParams
from arkitect.core.component.tts.constants import (
    EventSessionFinished,
    EventTTSSentenceEnd,
    EventTTSSentenceStart,
)
from arkitect.telemetry.logger import INFO
from event import *
from prompt import VoiceBotPrompt

StateInProgress = "InProgress"
StateIdle = "Idle"
# asr continuous detection no input duration, empirical value
ASRInterval = 2000
# Default tts live_voice_call
DEFAULT_SPEAKER = "zh_female_sajiaonvyou_moon_bigtts"


class VoiceBotService(BaseModel):
    asr_client: Optional[AsyncASRClient] = None
    tts_client: Optional[AsyncTTSClient] = None
    llm_ep_id: str
    state: str = StateIdle
    tts_speaker: str = DEFAULT_SPEAKER  # TTS live_voice_call

    """
    config vars
    """
    asr_app_key: str
    asr_access_key: str
    tts_app_key: str
    tts_access_key: str

    history_messages: List[ArkMessage] = []  # Store historical dialogue information

    asr_buffer: str = ""  # Reservoir asr recognition result
    asr_no_input_duration: int = 0  # Cumulated no live_voice_call recognition duration
    asr_last_duration: int = 0  # Last asr recognition duration

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def init(self):
        """
        Initialize the TTS and ASR clients.
        """
        self.tts_client = AsyncTTSClient(
            app_key=self.tts_app_key,
            access_key=self.tts_access_key,
            connection_params=ConnectionParams(
                speaker=self.tts_speaker, audio_params=AudioParams()
            ),
        )
        self.asr_client = AsyncASRClient(
            app_key=self.asr_app_key, access_key=self.asr_access_key
        )
        await self.asr_client.init()
        await self.tts_client.init()

    async def handler_loop(
        self, inputs: AsyncIterable[WebEvent]
    ) -> AsyncIterable[WebEvent]:
        """
        Main loop for handling input events and generating responses.
        """
        asr_responses = await self.handle_input_event(inputs)
        async for asr_recognized in self.handle_asr_response(asr_responses):
            # set state into InProgress
            self.state = StateInProgress
            yield WebEvent.from_payload(asr_recognized)
            llm_stream_rsp = self.stream_llm_chat(asr_recognized.sentence)
            async for payload in self.handle_tts_response(llm_stream_rsp):
                yield WebEvent.from_payload(payload)
            # recreate the asr and tts client
            self.state = StateIdle

    async def handle_input_event(
        self, inputs: AsyncIterable[WebEvent]
    ) -> AsyncIterable[ASRFullServerResponse]:
        """
        Handle input events and generate ASR responses.
        """

        async def async_gen() -> AsyncIterable[bytes]:
            async for input_event in inputs:
                if self.state != StateIdle:
                    INFO("service is InProgress, will ignore the incoming input")
                    continue
                elif not self.asr_client.inited:
                    INFO("need recreate asr conn")
                    await self.asr_client.init()

                INFO(
                    f"receive input, event={input_event.event} payload={input_event.payload}"
                )
                if input_event.event == BOT_UPDATE_CONFIG and isinstance(
                    input_event.payload, BotUpdateConfigPayload
                ):
                    self.tts_speaker = input_event.payload.speaker
                elif input_event.event == USER_AUDIO and input_event.data:
                    yield input_event.data

        return self.asr_client.stream_asr(async_gen())

    async def handle_asr_response(
        self, asr_responses: AsyncIterable[ASRFullServerResponse]
    ) -> AsyncIterable[SentenceRecognizedPayload]:
        """
        Handle ASR responses and generate recognized sentences.
        """
        async for response in asr_responses:
            if self.state == StateIdle:
                if self.asr_buffer and self.asr_no_input_duration > ASRInterval:
                    yield SentenceRecognizedPayload(sentence=self.asr_buffer)
                    self.asr_buffer = ""
                    self.asr_no_input_duration = 0
                    self.asr_last_duration = 0
                    await self.asr_client.close()
                elif response.result and response.result.text:
                    # buffering
                    increment_len = len(response.result.text) - len(self.asr_buffer)
                    self.asr_buffer = response.result.text
                    if increment_len > 0:
                        self.asr_last_duration = response.audio.duration
                    else:
                        self.asr_no_input_duration = (
                            response.audio.duration - self.asr_last_duration
                        )
                    INFO(
                        f"asr buffer incremented: {increment_len}, utterances: {response.result.utterances}"
                    )
            else:
                INFO("service is InProgress, will ignore the newer asr response")
                continue

    async def handle_tts_response(
        self, llm_output: AsyncIterable[str]
    ) -> AsyncIterable[
        Union[TTSSentenceStartPayload, TTSSentenceEndPayload, TTSDonePayload]
    ]:
        """
        Handle TTS responses and generate TTS events.
        """
        buffer = bytearray()
        if not self.tts_client.inited:
            INFO("need recreate tts client")
            await self.tts_client.init()
        async for tts_rsp in self.tts_client.tts(
            source=llm_output, include_transcript=True
        ):
            INFO(
                f"receive tts response: event={tts_rsp.event} transcript={tts_rsp.transcript} \
                audio len={len(tts_rsp.audio) if tts_rsp.audio else 0}"
            )
            if tts_rsp.event == EventTTSSentenceStart:
                yield TTSSentenceStartPayload(sentence=tts_rsp.transcript)
            elif tts_rsp.event == EventTTSSentenceEnd:
                yield TTSSentenceEndPayload(data=buffer)
                buffer.clear()
            elif tts_rsp.audio:
                buffer.extend(tts_rsp.audio)

            if tts_rsp.event == EventSessionFinished:
                yield TTSDonePayload()
                await self.tts_client.close()
                break

    async def stream_llm_chat(self, text: str) -> AsyncIterable[str]:
        """
        Stream chat with the LLM and generate responses.
        """
        self.history_messages.append(ArkMessage(**{"role": "user", "content": text}))

        llm = BaseChatLanguageModel(
            template=VoiceBotPrompt(),
            messages=self.history_messages,
            endpoint_id=self.llm_ep_id,
        )
        completion_buffer = ""

        async for chunk in llm.astream():
            if chunk.choices and chunk.choices[0].delta:
                yield chunk.choices[0].delta.content
                completion_buffer += chunk.choices[0].delta.content

        if completion_buffer:
            self.history_messages.append(
                ArkMessage(**{"role": "assistant", "content": completion_buffer})
            )

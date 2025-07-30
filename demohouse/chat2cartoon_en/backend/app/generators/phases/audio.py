import json
import time
from io import BytesIO
from typing import AsyncIterable, Optional, List

import tos
from arkitect.core.component.llm import ArkChatRequest, ArkChatResponse, ArkChatCompletionChunk
from arkitect.utils.context import get_reqid, get_resource_id
from arkitect.core.errors import InvalidParameter
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta, ChoiceDeltaToolCall, \
    ChoiceDeltaToolCallFunction

from app.clients.tos import TOSClient
from app.clients.tts import tts
from app.constants import ARTIFACT_TOS_BUCKET, VALID_TONES, DEFAULT_AUDIO_TONE, MAX_STORY_BOARD_NUMBER
from app.generators.base import Generator
from app.generators.phase import PhaseFinder, Phase
from app.logger import ERROR, INFO
from app.message_utils import extract_dict_from_message
from app.mode import Mode
from app.models.audio import Audio


def _get_tool_resp(index: int, content: Optional[str] = None) -> ArkChatCompletionChunk:
    return ArkChatCompletionChunk(
        id=get_reqid(),
        choices=[Choice(
            index=index,
            finish_reason=None if content else "stop",
            delta=ChoiceDelta(
                role="tool",
                content=f"{content}\n\n" if content else "",
                tool_calls=[
                    ChoiceDeltaToolCall(
                        index=index,
                        id="tool_call_id",
                        function=ChoiceDeltaToolCallFunction(
                            name="",
                            arguments="",
                        ),
                        type="function",
                    )
                ]
            )
        )],
        created=int(time.time()),
        model=get_resource_id(),
        object="chat.completion.chunk"
    )


class AudioGenerator(Generator):
    phase_finder: PhaseFinder
    request: ArkChatRequest
    tos_client: TOSClient
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode.NORMAL):
        super().__init__(request, mode)
        self.tos_client = TOSClient()
        self.phase_finder = PhaseFinder(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        tones = self.phase_finder.get_tones()

        if not tones:
            ERROR("tones not found")
            raise InvalidParameter("messages", "tones not found")

        if len(tones) > MAX_STORY_BOARD_NUMBER:
            ERROR("line count exceed limit")
            raise InvalidParameter("messages", "line count exceed limit")

        # handle case when some assets are already provided, only partial set of assets needs to be generated
        generated_audios: List[Audio] = []
        if self.mode == Mode.REGENERATION:
            dict_content = extract_dict_from_message(self.request.messages[-1].content)
            audios_json = dict_content.get("audios", [])
            for ri in audios_json:
                audio = Audio.model_validate(ri)
                if audio.url:
                    generated_audios.append(audio)

        INFO(f"generated_audios: {generated_audios}")

        # Return first
        content = f"phase={Phase.AUDIO.value}\n\n"

        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=content,
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk"
        )

        content = {"audios": [audio.model_dump() for audio in generated_audios]}

        generated_audios_indexes = set([a.index for a in generated_audios])
        for t in tones:
            if t.index in generated_audios_indexes:
                continue
            url = await self._generate_audio(t.line_en, t.tone, t.index)
            content["audios"].append(Audio(
                index=t.index,
                url=url,
            ).model_dump())

        yield _get_tool_resp(0, json.dumps(content))
        yield _get_tool_resp(1)

    async def _generate_audio(self, prompt: str, tone: str, index: int) -> str:
        try:
            if tone not in VALID_TONES:
                tone = DEFAULT_AUDIO_TONE

            audio_bytes = await tts(prompt, params={
                "audio_params": {"format": "mp3", "sample_rate": 24000},
            }, speaker=tone)

            tos_bucket_name = ARTIFACT_TOS_BUCKET
            tos_object_key = f"{get_reqid()}/{Phase.AUDIO.value}/{index}.mp3"

            self.tos_client.put_object(tos_bucket_name, tos_object_key, BytesIO(audio_bytes))

            output = self.tos_client.pre_signed_url(tos_bucket_name, tos_object_key)
            return output.signed_url
        except tos.exceptions.TosClientError as e:
            ERROR(f"fail with tos client error, message:{e.message}, cause: {e.cause}")
            return "failed to generate audio"
        except tos.exceptions.TosServerError as e:
            ERROR(f"fail with tos server error, code:{e.code}, message: {e.message}, request_id: {e.request_id}")
            return "failed to generate audio"
        except Exception as e:
            ERROR(f"failed to generate audio, error: {e}")
            return "failed to generate audio"

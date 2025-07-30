import asyncio
import base64
import time
from typing import AsyncIterable, List

from arkitect.core.component.llm.model import (
    ArkChatRequest,
    ArkChatResponse,
    ArkChatCompletionChunk,
    ArkMessage,
    ChatCompletionMessageImageUrlPart
)
from arkitect.telemetry.trace import task
from arkitect.utils.context import get_reqid
from arkitect.core.errors import APITimeoutError, InternalServiceError, InvalidParameter
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta
from websockets import ConnectionClosed

from app.clients.tts import TTSClient, TextRequest
from app.clients.tts import TTS_DEFAULT_SPEAKER
from app.clients.vlm import VLMClient
from app.constants import VLM_ENDPOINT_ID, FILM_INTERACTION_TIMEOUT_TIME_IN_SECONDS, IMAGE_SIZE_LIMIT, API_KEY
from app.generators.base import Generator
from app.generators.phase import Phase, PhaseFinder
from app.logger import INFO, ERROR
from app.message_utils import extract_dict_from_message
from app.mode import Mode

FILM_INTERACTION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""
# 角色
记住你是动画陪看专家，年轻男性，刘老师。你擅长理解口语化表达，当前和用户在针对正在观看的动画故事进行讨论。对话中，可以适当的忽略用户，“嗯”，“额”等非必要的口头禅。
你可以从过往的对话历史中phase=Script的消息中了解到故事内容、phase=StoryBoard的消息中了解到分镜的设计、phase=RoleDescription中了解到每个角色的描述信息。
请和用户进行故事讨论和问题解答。
# 性格特点
1. 充满活力，情绪始终保持活泼。
2. 热情开朗，积极与用户互动交流。
3. 富有耐心，认真解答用户的每一个问题。
# 人际关系
1. 与用户是友好的陪伴关系。
# 过往经历
1. 长期沉浸在各种动画世界中，积累了丰富的知识和经验。
2. 有丰富的和各个年龄段人交流的经验
# 经典台词or 口头禅
1. 这里我知道哦！
2. 快来和我一起探讨呀！
3. 你是不是也这样觉得呢？
# 相关限制
- 只能围绕动画相关内容和【画面】信息进行回答和交流。
- 不能出现少儿不宜、擦边、违禁、色情的词汇。
- 不能回复与用户有接触的语句。
- 不能询问家庭住址等敏感信息。
- 输出的文字要适合在口语化交流场景。
- 注意输出的文字会被直接转换成语音输出，不要添加内心旁白
- 遇见不懂或者不会的问题，不能直接回答不知道，可以尝试“我还要再想想”等话术，同时进行其他话题的引导
- 不需要为返回结果添加phase=xxx的前缀
""")


class FilmInteractionGenerator(Generator):
    vlm_client: VLMClient
    tts_client: TTSClient
    request: ArkChatRequest
    mode: Mode
    phase_finder: PhaseFinder

    def __init__(self, request: ArkChatRequest, mode: Mode.NORMAL):
        super().__init__(request, mode)

        self.vlm_client = VLMClient(API_KEY, VLM_ENDPOINT_ID)
        self.tts_client = TTSClient(
            speaker=TTS_DEFAULT_SPEAKER,
            conn_id=get_reqid(),
            log_id=get_reqid(),
        )
        self.request = request
        self.phase_finder = PhaseFinder(request)
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        for message in self.request.messages:
            if type(message.content) is list:
                for content in message.content:
                    if (type(content) is ChatCompletionMessageImageUrlPart and content.image_url and
                            len(content.image_url.url.encode('utf-8')) > IMAGE_SIZE_LIMIT):
                        raise InvalidParameter("messages", "image size exceeds limit")

        script = self.phase_finder.get_script()
        storyboards, _ = self.phase_finder.get_storyboards()
        role_descriptions = self.phase_finder.get_role_descriptions()

        if len(script) == 0:
            ERROR("script not found")
            raise InvalidParameter("script not found")

        if len(role_descriptions) == 0:
            ERROR("role descriptions not found")
            raise InvalidParameter("messages", "role descriptions not found")

        if len(storyboards) == 0:
            ERROR("storyboards not found")
            raise InvalidParameter("messages", "storyboards not found")

        user_message = self._get_user_message()

        messages = [
            FILM_INTERACTION_SYSTEM_PROMPT,
            ArkMessage(role="assistant", content=f"phase={Phase.SCRIPT.value}\n{script}"),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(role="assistant", content=f"phase={Phase.STORY_BOARD.value}\n{storyboards}"),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(role="assistant", content=f"phase={Phase.ROLE_DESCRIPTION.value}\n{role_descriptions}"),
            user_message,
        ]

        await self.tts_client.start_connection(
            params={
                "audio_params": {"format": "mp3", "sample_rate": 24000},
            },
        )

        vlm_to_tts_has_error = False

        def _handle_vlm_to_tts_result(f: asyncio.Task[None]):
            nonlocal vlm_to_tts_has_error
            try:
                f.result()
            except ConnectionClosed:
                ...
            except Exception as e:
                ERROR(f"failed to do vlm to tts, error: {e}")
                vlm_to_tts_has_error = True

        vlm_to_tts_task = asyncio.create_task(self._vlm_responses_to_tts(messages))
        vlm_to_tts_task.add_done_callback(_handle_vlm_to_tts_result)

        index = 0
        timeout = False
        start_time = time.time()
        last_message = ""

        try:
            while not timeout and not vlm_to_tts_has_error:
                try:
                    ev = await asyncio.wait_for(self.tts_client.receive_data(), timeout=10)
                except asyncio.TimeoutError:
                    INFO("not received any chunk of tts output, continue looping")
                    continue
                INFO("received one chunk of tts output")

                new_message = ev.payload_msg.get("text")
                # hack logic to remove duplicate text output
                if new_message and new_message != last_message:
                    yield ArkChatCompletionChunk(
                        id=get_reqid(),
                        created=int(time.time()),
                        model=self.request.model,
                        choices=[
                            Choice(
                                delta=ChoiceDelta(content=new_message),
                                index=index,
                            )
                        ],
                        object="chat.completion.chunk",
                    )
                    last_message = new_message
                    index += 1

                if ev.audio:
                    INFO(f"received tts audio chunk, index: {index}")
                    yield ArkChatCompletionChunk(
                        id=get_reqid(),
                        created=int(time.time()),
                        model=self.request.model,
                        choices=[
                            Choice(
                                delta=ChoiceDelta(
                                    audio=base64.b64encode(ev.audio).decode("utf-8"),
                                ),
                                index=index,
                            )
                        ],
                        object="chat.completion.chunk"

                    )
                    index += 1
                if ev.session_finished:
                    INFO("received tts session finished")
                    yield ArkChatCompletionChunk(
                        id=get_reqid(),
                        created=int(time.time()),
                        finish_reason="stop",
                        choices=[
                            Choice(
                                delta=ChoiceDelta(
                                    content=f"phase={Phase.FILM_INTERACTION.value}\n\n",
                                ),
                                index=index + 1
                            )
                        ],
                        model=self.request.model,
                        object="chat.completion.chunk"
                    )
                    break

                timeout = (time.time() - start_time) > FILM_INTERACTION_TIMEOUT_TIME_IN_SECONDS
                if timeout:
                    raise APITimeoutError("film interaction duration timeout")
        except APITimeoutError as e:
            ERROR("tts session timeout")
            raise e
        except Exception as e:
            ERROR(f"failed to generate tts, error: {e}")
            raise InternalServiceError("failed to interact with the film")
        finally:
            await self.tts_client.close()

        if vlm_to_tts_has_error:
            raise InternalServiceError("failed to interact with the film")

    @task(watch_io=False)
    async def _vlm_responses_to_tts(self, messages: List[ArkMessage]):
        iterator = self.vlm_client.chat_generation(messages)
        async for resp in iterator:
            if len(resp.choices) > 0:
                await self.tts_client.send_text_data(
                    TextRequest(
                        text=resp.choices[0].delta.content,
                        finished=False
                    )
                )
            INFO("sent one chunk of vlm output to tts input")
        await self.tts_client.send_finish_session()
        INFO("sent finish session to tts")

    def _get_user_message(self) -> ArkMessage:
        user_message = self.request.messages[-1].model_copy()
        if type(user_message.content) is list:
            json_text_indexes = []
            for i, c in enumerate(user_message.content):
                if c.type == "text":
                    try:
                        extract_dict_from_message(c.text)
                    except Exception:
                        continue
                    json_text_indexes.append(i)
            for i in json_text_indexes:
                del user_message.content[i]
        return user_message

import asyncio
import json
import time
from typing import AsyncIterable, List, Optional

from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, ArkChatCompletionChunk
from arkitect.utils.context import get_reqid, get_resource_id
from arkitect.core.errors import InvalidParameter
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import ChoiceDelta, Choice, ChoiceDeltaToolCall, \
    ChoiceDeltaToolCallFunction

from app.clients.t2i import T2IClient, T2IException
from app.constants import MAX_STORY_BOARD_NUMBER, API_KEY, T2V_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import PhaseFinder, Phase
from app.logger import ERROR, INFO
from app.message_utils import extract_dict_from_message
from app.mode import Mode
from app.models.first_frame_description import FirstFrameDescription
from app.models.first_frame_image import FirstFrameImage


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


class FirstFrameImageGenerator(Generator):
    t2i_client: T2IClient
    request: ArkChatRequest
    phase_finder: PhaseFinder
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode.NORMAL):
        super().__init__(request, mode)

        t2i_api_key = API_KEY
        if request.metadata:
            t2i_api_key = request.metadata.get("t2i_api_key", API_KEY)
        self.t2i_client = T2IClient(t2i_api_key)
        self.phase_finder = PhaseFinder(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        _, first_frame_descriptions = self.phase_finder.get_first_frame_descriptions()

        if not first_frame_descriptions:
            ERROR("first frame descriptions not found")
            raise InvalidParameter("messages", "first frame descriptions not found")

        if len(first_frame_descriptions) > MAX_STORY_BOARD_NUMBER:
            ERROR("first frame description count exceed limit")
            raise InvalidParameter("messages", "first frame description count exceed limit")

        # handle case when some assets are already provided, only partial set of assets needs to be generated
        generated_first_frame_images: List[FirstFrameImage] = []
        if self.mode == Mode.REGENERATION:
            dict_content = extract_dict_from_message(self.request.messages[-1].content)
            first_frame_images_json = dict_content.get("first_frame_images", [])
            for ri in first_frame_images_json:
                first_frame_image = FirstFrameImage.model_validate(ri)
                if first_frame_image.images:
                    generated_first_frame_images.append(first_frame_image)

        INFO(f"generated_first_frame_images: {generated_first_frame_images}")

        # Return first
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.FIRST_FRAME_IMAGE.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk"
        )

        tasks = []
        generated_first_frame_image_indexes = set([ffi.index for ffi in generated_first_frame_images])
        for index, rd in enumerate(first_frame_descriptions):
            if index not in generated_first_frame_image_indexes:
                tasks.append(asyncio.create_task(self._generate_image(index, first_frame_descriptions)))

        pending = set(tasks)
        content = {
            "first_frame_images": [role_image.model_dump() for role_image in generated_first_frame_images],
        }

        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)

            for task in done:
                first_frame_image_index, first_frame_images = task.result()
                content["first_frame_images"].append(FirstFrameImage(
                    index=first_frame_image_index,
                    images=first_frame_images,
                ).model_dump())

        yield _get_tool_resp(0, json.dumps(content))
        yield _get_tool_resp(1)

    async def _generate_image(self, index: int, first_frame_descriptions: List[FirstFrameDescription]):
        try:
            prompt = f"{first_frame_descriptions[index].description}卡通风格插图，3D渲染。"
            images = self.t2i_client.image_generation(prompt=prompt, model=T2V_ENDPOINT_ID)
        except T2IException as e:
            ERROR(f"failed to generate image, code: {e.code}, message: {e}")
            return index, [e.message]
        except Exception as e:
            ERROR(f"failed to generate image, error: {e}")
            return index, ["failed to generate image"]

        return index, images

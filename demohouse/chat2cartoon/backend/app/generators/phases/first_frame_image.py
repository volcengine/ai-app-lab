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

from volcenginesdkarkruntime.types.chat.chat_completion_chunk import (
    Choice,
    ChoiceDelta,
)

from app.clients.t2i import T2IClient, T2IException
from app.constants import MAX_STORY_BOARD_NUMBER
from app.generators.base import Generator
from app.generators.phase import Phase
from app.message_utils import extract_and_parse_dict_from_message
from app.mode import Mode
from app.models.first_frame_description import FirstFrameDescription
from app.models.first_frame_image import FirstFrameImage
from app.output_parsers import OutputParser
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR, INFO
from arkitect.utils.context import get_reqid, get_resource_id


class FirstFrameImageGenerator(Generator):
    t2i_client: T2IClient
    request: ArkChatRequest
    output_parser: OutputParser
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.t2i_client = T2IClient()
        self.output_parser = OutputParser(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # extract first frame descriptions to generate first frame image
        _, first_frame_descriptions = self.output_parser.get_first_frame_descriptions()

        if not first_frame_descriptions:
            ERROR("first frame descriptions not found")
            raise InvalidParameter("messages", "first frame descriptions not found")

        if len(first_frame_descriptions) > MAX_STORY_BOARD_NUMBER:
            ERROR("first frame description count exceed limit")
            raise InvalidParameter(
                "messages", "first frame description count exceed limit"
            )

        # user request can include first_frame_images field containing a list of FirstFrameImages they don't want
        # regenerated, handle case when some assets are already provided, only partial set of assets needs to be generated
        generated_first_frame_images: List[FirstFrameImage] = []
        if self.mode == Mode.REGENERATION:
            dict_content = extract_and_parse_dict_from_message(
                self.request.messages[-1].content
            )
            first_frame_images_json = dict_content.get("first_frame_images", [])
            for ri in first_frame_images_json:
                first_frame_image = FirstFrameImage.model_validate(ri)
                if first_frame_image.images:
                    generated_first_frame_images.append(first_frame_image)

        INFO(f"generated_first_frame_images: {generated_first_frame_images}")

        # send first stream
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
            object="chat.completion.chunk",
        )

        # create a list of role image generation tasks, skips images in generated_role_images
        tasks = []
        generated_first_frame_image_indexes = set(
            [ffi.index for ffi in generated_first_frame_images]
        )
        for index, rd in enumerate(first_frame_descriptions):
            if index not in generated_first_frame_image_indexes:
                tasks.append(
                    asyncio.create_task(
                        self._generate_image(index, first_frame_descriptions)
                    )
                )

        pending_tasks = set(tasks)
        content = {
            "first_frame_images": [
                role_image.model_dump() for role_image in generated_first_frame_images
            ],
        }

        # accumulates the task results
        while pending_tasks:
            done, pending_tasks = await asyncio.wait(
                pending_tasks, return_when=asyncio.FIRST_COMPLETED
            )

            for task in done:
                first_frame_image_index, first_frame_images = task.result()
                content["first_frame_images"].append(
                    FirstFrameImage(
                        index=first_frame_image_index,
                        images=first_frame_images,
                    ).model_dump()
                )

        # returns task results
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

        # finished generating first frame images
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

    async def _generate_image(
        self, index: int, first_frame_descriptions: List[FirstFrameDescription]
    ) -> (int, List[str]):
        try:
            prompt = (
                f"{first_frame_descriptions[index].description}卡通风格插图，3D渲染。"
            )
            images = self.t2i_client.image_generation(prompt)
        except T2IException as e:
            ERROR(f"failed to generate image, code: {e.code}, message: {e}")
            return index, [e.message]
        except Exception as e:
            ERROR(f"failed to generate image, error: {e}")
            return index, ["failed to generate image"]

        return index, images

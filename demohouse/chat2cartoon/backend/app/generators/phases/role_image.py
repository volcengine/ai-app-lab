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
from app.mode import Mode
from app.models.role_description import RoleDescription
from app.models.role_image import RoleImage
from app.output_parsers import OutputParser, parse_role_description
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR, INFO
from arkitect.utils.context import get_reqid, get_resource_id


class RoleImageGenerator(Generator):
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
        # extract role descriptions for generation of role images
        role_description_completion = self.output_parser.get_role_descriptions()
        role_descriptions = parse_role_description(role_description_completion)

        if not role_descriptions:
            ERROR("role descriptions not found")
            raise InvalidParameter("messages", "role descriptions not found")

        if len(role_descriptions) > MAX_STORY_BOARD_NUMBER:
            ERROR("role description count exceed limit")
            raise InvalidParameter("messages", "role description count exceed limit")

        # user request can include role_images field containing a list of RoleImages they don't want regenerated
        # handle case when some assets are already provided and only a subset of assets needs to be regenerated
        generated_role_images: List[RoleImage] = []
        if self.mode == Mode.REGENERATION:
            role_images_json = self.output_parser.get_role_images()
            for ri in role_images_json:
                role_image = RoleImage.model_validate(ri)
                if role_image.images:
                    generated_role_images.append(role_image)

        INFO(f"generated_role_images: {generated_role_images}")

        # send first stream
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(content=f"phase={Phase.ROLE_IMAGE.value}\n\n"),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        # create a list of role image generation tasks, skips images in generated_role_images
        tasks = []
        generated_role_image_indexes = set([ri.index for ri in generated_role_images])
        for index, rd in enumerate(role_descriptions):
            if index not in generated_role_image_indexes:
                tasks.append(
                    asyncio.create_task(self._generate_image(index, role_descriptions))
                )

        pending_tasks = set(tasks)
        content = {
            "role_images": [
                role_image.model_dump() for role_image in generated_role_images
            ],
        }

        # accumulates the task results
        while len(pending_tasks) > 0:
            done, pending_tasks = await asyncio.wait(
                pending_tasks, return_when=asyncio.FIRST_COMPLETED
            )

            for task in done:
                role_image_index, role_images = task.result()
                content["role_images"].append(
                    RoleImage(index=role_image_index, images=role_images).model_dump()
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

        # finished generating role images
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
        self, index: int, role_descriptions: List[RoleDescription]
    ) -> (int, List[str]):
        try:
            prompt = f"{role_descriptions[index].description}卡通风格插图，3D渲染。"
            images = self.t2i_client.image_generation(prompt)
        except T2IException as e:
            ERROR(f"failed to generate image, code: {e.code}, message: {e}")
            return index, [e.message]
        except Exception as e:
            ERROR(f"failed to generate image, error: {e}")
            return index, ["failed to generate image"]

        return index, images

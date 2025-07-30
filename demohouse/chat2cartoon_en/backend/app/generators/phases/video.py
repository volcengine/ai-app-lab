import asyncio
import json
import time
from typing import AsyncIterable, Tuple, List, Optional

import requests
import tos
from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, ArkChatCompletionChunk
from arkitect.utils.context import get_reqid, get_resource_id
from arkitect.core.errors import InvalidParameter
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import ChoiceDelta, Choice, ChoiceDeltaToolCall, \
    ChoiceDeltaToolCallFunction
from byteplussdkarkruntime import Ark

from app.clients.ark_console import ArkConsoleClient, CreateVideoGenTaskRequest, TosLocation, TosConfig
from app.clients.downloader import DownloaderClient
from app.clients.tos import TOSClient
from app.constants import ARTIFACT_TOS_BUCKET, MAX_STORY_BOARD_NUMBER, API_KEY, CGT_ENDPOINT_ID, REGION
from app.generators.base import Generator
from app.generators.phase import Phase, PhaseFinder
from app.logger import ERROR, INFO
from app.message_utils import extract_dict_from_message
from app.mode import Mode
from app.models.first_frame_image import FirstFrameImage
from app.models.video import Video
from app.models.video_description import VideoDescription


def _merge_video_descriptions_and_first_frame_images(video_descriptions: List[VideoDescription],
                                                     first_frame_images: List[FirstFrameImage]) -> List[
    Tuple[int, VideoDescription, FirstFrameImage]]:
    video_descriptions_by_index = {i: s for i, s in enumerate(video_descriptions)}
    first_frame_images_by_index = {ffi.index: ffi for ffi in first_frame_images}

    # Merge dictionaries with the same index
    merged = []
    all_indices = set(video_descriptions_by_index.keys()) | set(first_frame_images_by_index.keys())

    for index in all_indices:
        if index not in video_descriptions_by_index:
            ERROR(f"failed to find index {index} in video_descriptions_by_index")
            raise InvalidParameter("messages", f"failed to find index {index} in videos")
        if index not in first_frame_images_by_index:
            ERROR(f"failed to find index {index} in first_frame_images_by_index")
            raise InvalidParameter("messages", f"failed to find index {index} in first_frame_images")

        merged.append((index, video_descriptions_by_index[index], first_frame_images_by_index[index]))

    return merged


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


class VideoGenerator(Generator):
    content_generation_client: Ark
    tos_client: TOSClient
    downloader_client: DownloaderClient
    phase_finder: PhaseFinder
    request: ArkChatRequest
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode.NORMAL):
        super().__init__(request, mode)
        self.content_generation_client = Ark(api_key=API_KEY, region=REGION)
        self.tos_client = TOSClient()
        self.downloader_client = DownloaderClient()
        self.phase_finder = PhaseFinder(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        first_frame_images = self.phase_finder.get_first_frame_images()
        video_descriptions = self.phase_finder.get_video_descriptions()

        if not first_frame_images:
            ERROR("first frame images not found")
            raise InvalidParameter("messages", "first frame images not found")

        if not video_descriptions:
            ERROR("video descriptions not found")
            raise InvalidParameter("messages", "video descriptions not found")

        if len(first_frame_images) != len(video_descriptions):
            ERROR(
                f"first frame images or video description counts are incorrect, len(first_frame_images)={len(first_frame_images)}, len(video_descriptions)={len(video_descriptions)}")
            raise InvalidParameter("messages", "first frame images or video description counts are incorrect")

        if len(first_frame_images) > MAX_STORY_BOARD_NUMBER:
            ERROR("first frame image count exceed limit")
            raise InvalidParameter("messages", "first frame image count exceed limit")

        # handle case when some assets are already provided, only partial set of assets needs to be generated
        generated_videos: List[Video] = []
        if self.mode == Mode.REGENERATION:
            dict_content = extract_dict_from_message(self.request.messages[-1].content)
            videos_json = dict_content.get("videos", [])
            for v in videos_json:
                video = Video.model_validate(v)
                if video.video_gen_task_id:
                    generated_videos.append(video)

        INFO(f"generated_videos: {generated_videos}")

        merged = _merge_video_descriptions_and_first_frame_images(video_descriptions, first_frame_images)

        # Return first
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.VIDEO.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk"
        )

        tasks = []
        generated_video_indexes = set([v.index for v in generated_videos])
        for index, video_descriptions, first_frame_image in merged:
            if index not in generated_video_indexes:
                tasks.append(asyncio.create_task(
                    self._process_image(index, video_descriptions.description, first_frame_image.images[0])))

        pending = set(tasks)
        content = {"videos": [role_image.model_dump() for role_image in generated_videos], }

        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)

            for task in done:
                video_index, video_gen_task_id = task.result()
                content["videos"].append(Video(
                    index=video_index,
                    video_gen_task_id=video_gen_task_id
                ).model_dump())

        yield _get_tool_resp(0, json.dumps(content))
        yield _get_tool_resp(1)

    async def _process_image(self, index: int, prompt: str, image_url: str) -> Tuple[int, str]:
        try:
            # Create Video Gen Task
            resp = self.content_generation_client.content_generation.tasks.create(
                model=CGT_ENDPOINT_ID,
                content=[
                    {
                        "type": "text",
                        "text": prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                        },
                    },
                ],
            )
            video_gen_task_id = resp.id

        except Exception as e:
            ERROR(f"fail to generate video, err: {e}, prompt: {prompt}, image_url: {image_url}, model: {CGT_ENDPOINT_ID}")
            return index, "failed to generate video"

        return index, video_gen_task_id

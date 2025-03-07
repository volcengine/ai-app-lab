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
import os
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from typing import AsyncIterable, List, Optional

from moviepy import AudioFileClip, CompositeVideoClip, TextClip, VideoFileClip
from moviepy.video.fx import CrossFadeIn, CrossFadeOut
from moviepy.video.tools.subtitles import SubtitlesClip
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import (
    Choice,
    ChoiceDelta,
)

from app.clients.downloader import DownloaderClient
from app.clients.tos import TOSClient
from app.constants import ARTIFACT_TOS_BUCKET, MAX_STORY_BOARD_NUMBER
from app.generators.base import Generator
from app.generators.phase import Phase
from app.mode import Mode
from app.models.audio import Audio
from app.models.film import Film
from app.models.tone import Tone
from app.models.video import Video
from app.output_parsers import OutputParser
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)
from arkitect.core.errors import InternalServiceError, InvalidParameter
from arkitect.telemetry.logger import ERROR, INFO
from arkitect.utils.context import get_reqid, get_resource_id

_current_dir = os.path.dirname(os.path.abspath(__file__))
_font = os.path.join(_current_dir, "../../../media/DouyinSansBold.otf")

_FADE_IN_DURATION_IN_SECONDS = 0.5
_FADE_OUT_DURATION_IN_SECONDS = 0.5


def _split_subtitle_en(input_string: str, max_length: int = 40):
    words = input_string.split()
    result = []
    current_part = []

    for word in words:
        if len(" ".join(current_part + [word])) <= max_length:
            current_part.append(word)
        else:
            result.append(" ".join(current_part))
            current_part = [word]

    if current_part:
        result.append(" ".join(current_part))

    return result


def _split_subtitle_cn(input_string: str, max_length: int = 40):
    result = []
    current_part = []

    for char in input_string:
        current_part.append(char)
        if len(current_part) == max_length:
            result.append("".join(current_part))
            current_part = []

    if current_part:
        result.append("".join(current_part))

    return result


def _split_subtitle(line: str, start_time: int, end_time: int, split_fn) -> List:
    total_length = len(line)
    lines = split_fn(line, 40)
    total_duration = end_time - start_time
    start = start_time
    subtitles = []
    for l in lines:
        end = start + total_duration * len(l) / total_length
        subtitles.append(((start, end), l))
        start = end
    return subtitles


def _generate_film(
    req_id: str, tones: List[Tone], videos: List[Video], audios: List[Audio]
):
    videos.sort(key=lambda video: video.index)
    audios.sort(key=lambda audio: audio.index)

    video_clips = []
    cn_subtitles = []
    en_subtitles = []

    clip_start_time = 0.0
    start = []
    elements = list(zip(tones, videos, audios))
    for i, (t, v, a) in enumerate(elements):
        start.append(clip_start_time)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as video_temp:
            video_temp.write(v.video_data)
            video_clip = VideoFileClip(video_temp.name)

        with tempfile.NamedTemporaryFile(suffix=".mp3") as audio_temp:
            audio_temp.write(a.audio_data)
            audio_clip = AudioFileClip(audio_temp.name)
            if audio_clip.duration > video_clip.duration:
                audio_clip = audio_clip.subclipped(0, video_clip.duration)

        video_clip = video_clip.with_audio(audio_clip)

        # Add subtitles
        clip_end_time = clip_start_time + video_clip.duration
        # slice subtitles if the line cannot fit to one row
        if t.line:
            cn_subtitles.extend(
                _split_subtitle(
                    t.line, clip_start_time, clip_end_time, _split_subtitle_cn
                )
            )
        if t.line_en:
            en_subtitles.extend(
                _split_subtitle(
                    t.line_en, clip_start_time, clip_end_time, _split_subtitle_en
                )
            )

        # add cross-fade in or out to every clip
        if i != 0:
            video_clip = CrossFadeIn(duration=_FADE_IN_DURATION_IN_SECONDS).apply(
                video_clip
            )
        if i != len(elements) - 1:
            video_clip = CrossFadeOut(duration=_FADE_OUT_DURATION_IN_SECONDS).apply(
                video_clip
            )
            # to overlap 2 clips, end time must deduct with the fade out duration
            clip_end_time = clip_end_time - _FADE_OUT_DURATION_IN_SECONDS
        video_clips.append(video_clip)
        clip_start_time = clip_end_time

    # Concatenate all clips
    clips = []
    for index, (video_clip, start_time) in enumerate(zip(video_clips, start)):
        video_clip = video_clip.with_start(start_time).with_position("center")
        clips.append(video_clip)

    cn_generator = lambda text: TextClip(
        font=_font,
        text=text,
        font_size=24,
        color="white",
        stroke_color="#021526",
        horizontal_align="center",
        vertical_align="bottom",
        size=clips[0].size,
        margin=(None, -60, None, None),
    )
    cn_subtitle_clip = SubtitlesClip(cn_subtitles, make_textclip=cn_generator)

    en_generator = lambda text: TextClip(
        font=_font,
        text=text,
        font_size=24,
        color="white",
        stroke_color="#021526",
        horizontal_align="center",
        vertical_align="bottom",
        size=clips[0].size,
        margin=(None, -30, None, None),
    )
    en_subtitle_clip = SubtitlesClip(en_subtitles, make_textclip=en_generator)
    final_video = CompositeVideoClip(clips + [cn_subtitle_clip, en_subtitle_clip])

    tos_client = TOSClient()
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_film_file_path = f"{tmp_dir}/{req_id}.mp4"
            final_video.write_videofile(
                tmp_film_file_path,
                codec="libx264",
                audio_codec="aac",
                temp_audiofile_path=f"{tmp_dir}/",
            )
            INFO("generated final video")

            tos_bucket_name = ARTIFACT_TOS_BUCKET
            tos_object_key = f"{req_id}/{Phase.FILM.value}.mp4"
            tos_client.put_object_from_file(
                tos_bucket_name, tos_object_key, tmp_film_file_path
            )
            INFO("put final video to TOS")

    except Exception as e:
        ERROR(f"failed to generate film, error: {e}")
        raise InternalServiceError("failed to generate film")

    output = tos_client.pre_signed_url(tos_bucket_name, tos_object_key)
    film_pre_signed_url = output.signed_url

    return film_pre_signed_url


class FilmGenerator(Generator):
    """Edits the video and audio files together for the complete cartoon film with subtitles."""

    output_parser: OutputParser
    request: ArkChatRequest
    ark_runtime_client: Ark
    downloader_client: DownloaderClient
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.ark_runtime_client = Ark()
        self.downloader_client = DownloaderClient()
        self.output_parser = OutputParser(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        tones = self.output_parser.get_tones()
        videos = self.output_parser.get_videos()
        audios = self.output_parser.get_audios()

        if not tones:
            ERROR("tones not found")
            raise InvalidParameter("messages", "tones not found")

        if not videos:
            ERROR("videos not found")
            raise InvalidParameter("messages", "videos not found")

        if not audios:
            ERROR("audios not found")
            raise InvalidParameter("messages", "audios not found")

        if len(tones) != len(videos) or len(tones) != len(audios):
            ERROR("number of tones videos and audios do not match")
            raise InvalidParameter(
                "messages", "number of tones videos and audios do not match"
            )

        if len(tones) > MAX_STORY_BOARD_NUMBER:
            ERROR("tones count exceed limit")
            raise InvalidParameter("messages", "tones count exceed limit")

        INFO(
            f"len(tones) = {len(tones)}, len(videos) = {len(videos)}, len(audios) = {len(audios)}"
        )

        # send first frame
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.FILM.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        video_download_tasks = [
            asyncio.create_task(self._download_video(v)) for v in videos
        ]
        audio_download_tasks = [
            asyncio.create_task(self._download_audio(a)) for a in audios
        ]
        tasks = video_download_tasks + audio_download_tasks
        await asyncio.gather(*tasks)

        # generates film using moviepy. since moviepy has potential memory leak problem, a new process is created to run
        # so that memory is automatically released after the process is completed and terminated
        loop = asyncio.get_event_loop()
        film_pre_signed_url = await loop.run_in_executor(
            ProcessPoolExecutor(), _generate_film, get_reqid(), tones, videos, audios
        )

        content = {"film": Film(url=film_pre_signed_url).model_dump()}
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        role="tool",
                        content=f"{json.dumps(content)}\n\n",
                    ),
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
                    delta=ChoiceDelta(
                        role="tool",
                        content="",
                    ),
                )
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

    async def _download_video(self, v: Video):
        content_generation_task = self.ark_runtime_client.content_generation.tasks.get(
            task_id=v.content_generation_task_id
        )
        if content_generation_task.status != "succeeded":
            ERROR(f"video is not ready, index: {v.index}")
            raise InvalidParameter("messages", "video is not ready")

        # Download video
        image_binary, _ = self.downloader_client.download_to_memory(
            content_generation_task.content.video_url
        )

        v.video_data = image_binary.read()
        INFO(f"downloaded video, index: {v.index}")

    async def _download_audio(self, a: Audio):
        if not a.url.startswith("http"):
            raise InvalidParameter("message", "invalid audio url")
        audio_data, _ = self.downloader_client.download_to_memory(a.url)
        a.audio_data = audio_data.read()
        INFO(f"downloaded audio, index: {a.index}")

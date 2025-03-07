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

import re
from typing import Any, Dict, List, Tuple

from app.message_utils import extract_and_parse_dict_from_message
from app.mode import Mode
from app.models.audio import Audio
from app.models.first_frame_description import FirstFrameDescription
from app.models.first_frame_image import FirstFrameImage
from app.models.role_description import RoleDescription
from app.models.role_image import RoleImage
from app.models.story_board import StoryBoard
from app.models.tone import Tone
from app.models.video import Video
from app.models.video_description import VideoDescription
from arkitect.core.component.llm.model import ArkChatRequest, ArkMessage


def parse_storyboards(completions: str) -> List[StoryBoard]:
    characters = re.findall(r"角色[：:](.*)", completions)
    scenes = re.findall(r"画面[：:](.*)", completions)
    lines = re.findall(r"中文台词[：:](.*)", completions)
    lines_en = re.findall(r"英文台词[：:](.*)", completions)

    story_boards = []
    for c, s, l, le in zip(characters, scenes, lines, lines_en):
        story_boards.append(
            StoryBoard(
                characters=c.split("，") if "，" in c else [c],
                scene=s,
                lines=l,
                lines_en=le,
            )
        )
    return story_boards


def parse_role_description(completions: str) -> List[RoleDescription]:
    descriptions = re.findall(r"角色描述[：:](.*)", completions)
    role_descriptions = [RoleDescription(description=d) for d in descriptions]
    return role_descriptions


def parse_first_frame_description(completions: str) -> List[FirstFrameDescription]:
    descriptions = re.findall(r"首帧描述[：:](.*)", completions)
    characters = re.findall(r"角色[：:](.*)", completions)
    first_frame_descriptions = [
        FirstFrameDescription(
            description=d,
            characters=c.split("，") if "，" in c else [c],
        )
        for d, c in zip(descriptions, characters)
    ]
    return first_frame_descriptions


def parse_video_description(completions: str) -> List[VideoDescription]:
    descriptions = re.findall(r"描述[：:](.*)", completions)
    characters = re.findall(r"角色[：:](.*)", completions)
    video_descriptions = [
        VideoDescription(
            description=d,
            characters=c.split("，") if "，" in c else [c],
        )
        for d, c in zip(descriptions, characters)
    ]
    return video_descriptions


def parse_tone(completions: str) -> List[Tone]:
    lines = re.findall(r"中文台词[：:](.*)", completions)
    lines_en = re.findall(r"英文台词[：:](.*)", completions)
    tones_text = re.findall(r"音色[：:](.*)", completions)

    tones = []
    for i, (l, le, t) in enumerate(zip(lines, lines_en, tones_text)):
        tones.append(
            Tone(
                index=i,
                line=l,
                line_en=le,
                tone=t,
            )
        )
    return tones


class OutputParser:
    """
    A class for parsing the contents of the last request message.
    Content can be a JSON or a formatted text LLM output.
    """

    messages: List[ArkMessage]
    """
    The list of messages to be processed.
    """

    def __init__(self, req: ArkChatRequest):
        self.messages = req.messages

    def _get_dict_from_last_user_message(self) -> Dict[str, Any]:
        """
        Extract and parses json text as a dictionary in the last user message. Assumes that
        the user message has Mode prefix (CONFIRMATION or REGENERATION)
        """
        last_user_message = self.messages[-1]
        if last_user_message.role != "user":
            return {}

        json_message = None

        if type(last_user_message.content) is str:
            content = last_user_message.content
            if content.startswith(Mode.CONFIRMATION.value) or content.startswith(
                Mode.REGENERATION.value
            ):
                json_message = content
        elif (
            type(last_user_message.content) is list
        ):  # content is a list during the FilmInteraction phase
            for content in last_user_message.content:
                if content.type == "text":
                    c_text = content.text
                    if c_text.startswith(Mode.CONFIRMATION.value) or c_text.startswith(
                        Mode.REGENERATION.value
                    ):
                        json_message = c_text

        if json_message:
            return extract_and_parse_dict_from_message(json_message)

        return {}

    def get_script(self) -> str:
        dict_content = self._get_dict_from_last_user_message()
        storyboards_text = dict_content.get("script", "")
        return storyboards_text

    def get_storyboards(self) -> Tuple[str, List[StoryBoard]]:
        dict_content = self._get_dict_from_last_user_message()
        storyboards_text = dict_content.get("storyboards", "")
        storyboards = parse_storyboards(storyboards_text)
        return storyboards_text, storyboards

    def get_role_descriptions(self) -> str:
        dict_content = self._get_dict_from_last_user_message()
        role_description_text = dict_content.get("role_descriptions", "")
        return role_description_text

    def get_role_images(self) -> List[RoleImage]:
        dict_content = self._get_dict_from_last_user_message()
        role_images_json = dict_content.get("role_images", [])
        return [RoleImage.model_validate(ri) for ri in role_images_json]

    def get_first_frame_descriptions(self) -> Tuple[str, List[FirstFrameDescription]]:
        dict_content = self._get_dict_from_last_user_message()
        first_frame_description_text = dict_content.get("first_frame_descriptions", "")
        first_frame_descriptions = parse_first_frame_description(
            first_frame_description_text
        )
        return first_frame_description_text, first_frame_descriptions

    def get_first_frame_images(self) -> List[FirstFrameImage]:
        dict_content = self._get_dict_from_last_user_message()
        first_frame_images_json = dict_content.get("first_frame_images", [])
        return [FirstFrameImage.model_validate(ffi) for ffi in first_frame_images_json]

    def get_video_descriptions(self) -> List[VideoDescription]:
        dict_content = self._get_dict_from_last_user_message()
        video_description_text = dict_content.get("video_descriptions", "")
        video_description = parse_video_description(video_description_text)
        return video_description

    def get_videos(self) -> List[Video]:
        dict_content = self._get_dict_from_last_user_message()
        video_json = dict_content.get("videos", [])
        return [Video.model_validate(v) for v in video_json]

    def get_tones(self) -> List[Tone]:
        dict_content = self._get_dict_from_last_user_message()
        tone_json = dict_content.get("tones", [])
        return [Tone.model_validate(t) for t in tone_json]

    def get_audios(self) -> List[Audio]:
        dict_content = self._get_dict_from_last_user_message()
        audio_json = dict_content.get("audios", [])
        return [Audio.model_validate(a) for a in audio_json]

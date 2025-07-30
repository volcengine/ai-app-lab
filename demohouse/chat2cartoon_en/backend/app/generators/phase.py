import re
from enum import Enum
from typing import List, Dict, Optional, Tuple, Any

from arkitect.core.component.llm.model import ArkChatRequest, ArkMessage
from arkitect.core.errors import InvalidParameter

from app.logger import ERROR
from app.message_utils import extract_dict_from_message
from app.mode import Mode
from app.models.audio import Audio
from app.models.first_frame_description import FirstFrameDescription
from app.models.first_frame_image import FirstFrameImage
from app.models.role_image import RoleImage
from app.models.story_board import StoryBoard
from app.models.tone import Tone
from app.models.video import Video
from app.models.video_description import VideoDescription
from app.output_parsers import parse_storyboards, parse_video_description, parse_first_frame_description


class Phase(Enum):
    SCRIPT = "Script"
    STORY_BOARD = "StoryBoard"
    ROLE_DESCRIPTION = "RoleDescription"
    ROLE_IMAGE = "RoleImage"
    FIRST_FRAME_DESCRIPTION = "FirstFrameDescription"
    FIRST_FRAME_IMAGE = "FirstFrameImage"
    VIDEO_DESCRIPTION = "VideoDescription"
    VIDEO = "Video"
    TONE = "Tone"
    AUDIO = "Audio"
    FILM = "Film"
    FILM_INTERACTION = "FilmInteraction"


PHASE_ORDER = [
    Phase.SCRIPT,
    Phase.STORY_BOARD,
    Phase.ROLE_DESCRIPTION,
    Phase.ROLE_IMAGE,
    Phase.FIRST_FRAME_DESCRIPTION,
    Phase.FIRST_FRAME_IMAGE,
    Phase.VIDEO_DESCRIPTION,
    Phase.VIDEO,
    Phase.TONE,
    Phase.AUDIO,
    Phase.FILM,
    Phase.FILM_INTERACTION,
]


def _get_phase_order(phase: Phase) -> int:
    """
    Returns the order of the given phase.
    """
    return PHASE_ORDER.index(phase)


def get_phase_from_message(message: str) -> Optional[Phase]:
    """
    Extracts the phase from the given message.
    """
    match = re.search(r"phase=(\w+)", message)

    if not match:
        return None

    try:
        phase = Phase(match.group(1))
        if phase:
            return phase
    except ValueError:
        ERROR(f"messages malformed with unidentified phase, message: {message}")
        raise InvalidParameter("messages", "messages malformed with unknown phase prefix")


class PhaseFinder:
    """
    A class for finding the next phase based on the existing messages.
    """

    messages: List[ArkMessage]
    """
    The list of messages to be processed.
    """

    phase_message: Dict[Phase, Tuple[int, ArkMessage]]
    """
    A dictionary mapping each phase to its corresponding message.
    """

    def __init__(self, req: ArkChatRequest):
        self.messages = req.messages
        self._construct_phase_message()

    def _construct_phase_message(self):
        """
        Constructs a dictionary mapping each phase to its corresponding message.
        """
        phase_message = {}
        for index, message in enumerate(self.messages):
            if message.role != "assistant":
                continue
            phase = get_phase_from_message(message.content)

            if not phase:
                continue

            phase_message[phase] = (index, message)
        self.phase_message = phase_message

    def get_phase_message(self, phase: Phase) -> Tuple[int, Optional[ArkMessage]]:
        """
        Returns the message associated with the given phase.
        """
        phase_message = self.phase_message.get(phase)
        if not phase_message:
            raise InvalidParameter("messages", f"phase {phase} not found")
        return phase_message

    def get_next_phase(self) -> Phase:
        """
        Returns the next phase based on the existing messages.
        """
        existing_phases = [_get_phase_order(p) for p in self.phase_message.keys()] or [-1]
        current_phase_index = max(existing_phases) + 1

        if current_phase_index >= len(PHASE_ORDER):
            current_phase_index = len(PHASE_ORDER) - 1
        if current_phase_index < 0:
            current_phase_index = 0

        return PHASE_ORDER[current_phase_index]

    def get_dict_from_message(self) -> Dict[str, Any]:
        last_user_message = self.messages[-1]
        if last_user_message.role != "user":
            return {}

        if type(last_user_message.content) is str:
            if last_user_message.content.startswith(Mode.CONFIRMATION.value) or \
                    last_user_message.content.startswith(Mode.REGENERATION.value):
                return extract_dict_from_message(last_user_message.content)

        elif type(last_user_message.content) is list:
            for c in last_user_message.content:
                if c.type == "text":
                    try:
                        d = extract_dict_from_message(c.text)
                    except Exception:
                        continue
                    return d

        return {}

    def get_script(self) -> str:
        dict_content = self.get_dict_from_message()
        storyboards_text = dict_content.get("script", "")
        return storyboards_text

    def get_storyboards(self) -> Tuple[str, List[StoryBoard]]:
        dict_content = self.get_dict_from_message()
        storyboards_text = dict_content.get("storyboards", "")
        storyboards = parse_storyboards(storyboards_text)
        return storyboards_text, storyboards

    def get_role_descriptions(self) -> str:
        dict_content = self.get_dict_from_message()
        role_description_text = dict_content.get("role_descriptions", "")
        return role_description_text

    def get_role_images(self) -> List[RoleImage]:
        dict_content = self.get_dict_from_message()
        role_images_json = dict_content.get("role_images", [])
        return [RoleImage.model_validate(ri) for ri in role_images_json]

    def get_first_frame_descriptions(self) -> Tuple[str, List[FirstFrameDescription]]:
        dict_content = self.get_dict_from_message()
        first_frame_description_text = dict_content.get("first_frame_descriptions", "")
        first_frame_descriptions = parse_first_frame_description(first_frame_description_text)
        return first_frame_description_text, first_frame_descriptions

    def get_first_frame_images(self) -> List[FirstFrameImage]:
        dict_content = self.get_dict_from_message()
        first_frame_images_json = dict_content.get("first_frame_images", [])
        return [FirstFrameImage.model_validate(ffi) for ffi in first_frame_images_json]

    def get_video_descriptions(self) -> List[VideoDescription]:
        dict_content = self.get_dict_from_message()
        video_description_text = dict_content.get("video_descriptions", "")
        video_description = parse_video_description(video_description_text)
        return video_description

    def get_videos(self) -> List[Video]:
        dict_content = self.get_dict_from_message()
        video_json = dict_content.get("videos", [])
        return [Video.model_validate(v) for v in video_json]

    def get_tones(self) -> List[Tone]:
        dict_content = self.get_dict_from_message()
        tone_json = dict_content.get("tones", [])
        return [Tone.model_validate(t) for t in tone_json]

    def get_audios(self) -> List[Audio]:
        dict_content = self.get_dict_from_message()
        audio_json = dict_content.get("audios", [])
        return [Audio.model_validate(a) for a in audio_json]

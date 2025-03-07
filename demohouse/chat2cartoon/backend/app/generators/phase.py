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
from enum import Enum
from typing import Dict, List, Optional, Tuple

from arkitect.core.component.llm.model import ArkChatRequest, ArkMessage
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR


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


def get_phase_from_message(message: str) -> Optional[Phase]:
    """Extracts the phase from the given message."""
    match = re.search(r"phase=(\w+)", message)

    if not match:
        return None

    try:
        phase = Phase(match.group(1))
        if phase:
            return phase
    except ValueError:
        ERROR(f"messages malformed with unidentified phase, message: {message}")
        raise InvalidParameter(
            "messages", "messages malformed with unknown phase prefix"
        )


class PhaseFinder:
    """A class for finding the next phase based on the existing messages."""

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
        """Constructs a dictionary mapping each phase to its corresponding message."""
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
        """Returns the message associated with the given phase."""
        phase_message = self.phase_message.get(phase)
        if not phase_message:
            raise InvalidParameter("messages", f"phase {phase} not found")
        return phase_message

    def get_next_phase(self) -> Phase:
        """Returns the next phase based on the existing messages."""
        existing_phases = [PHASE_ORDER.index(p) for p in self.phase_message.keys()] or [
            -1
        ]
        current_phase_index = max(existing_phases) + 1

        # FILM_INTERACTION phase should recur indefinitely
        if current_phase_index >= len(PHASE_ORDER):
            current_phase_index = len(PHASE_ORDER) - 1

        return PHASE_ORDER[current_phase_index]

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

from app.generators.base import Generator
from app.generators.phase import Phase
from app.generators.phases.audio import AudioGenerator
from app.generators.phases.film import FilmGenerator
from app.generators.phases.film_interaction import FilmInteractionGenerator
from app.generators.phases.first_frame_description import FirstFrameDescriptionGenerator
from app.generators.phases.first_frame_image import FirstFrameImageGenerator
from app.generators.phases.initiation import InitiationGenerator
from app.generators.phases.role_image import RoleImageGenerator
from app.generators.phases.tone import ToneGenerator
from app.generators.phases.video import VideoGenerator
from app.generators.phases.video_description import VideoDescriptionGenerator
from app.mode import Mode
from arkitect.core.component.llm.model import ArkChatRequest

generator_map = {
    # The first 3 steps are InitiationGenerator because the users may keep asking the llm to regenerate
    # any step. We rely on the LLM to determine which phase it should be run
    Phase.SCRIPT: InitiationGenerator,
    Phase.STORY_BOARD: InitiationGenerator,
    Phase.ROLE_DESCRIPTION: InitiationGenerator,
    # The rest of the steps are the specific generator
    Phase.ROLE_IMAGE: RoleImageGenerator,
    Phase.FIRST_FRAME_DESCRIPTION: FirstFrameDescriptionGenerator,
    Phase.FIRST_FRAME_IMAGE: FirstFrameImageGenerator,
    Phase.VIDEO_DESCRIPTION: VideoDescriptionGenerator,
    Phase.VIDEO: VideoGenerator,
    Phase.TONE: ToneGenerator,
    Phase.AUDIO: AudioGenerator,
    Phase.FILM: FilmGenerator,
    Phase.FILM_INTERACTION: FilmInteractionGenerator,
}


class GeneratorFactory:
    phase: Phase

    def __init__(self, phase: Phase):
        self.phase = phase

    def get_generator(self, request: ArkChatRequest, mode: Mode) -> Generator:
        g_class = generator_map.get(self.phase)
        if not g_class:
            raise ValueError(f"Phase {self.phase} not supported")

        return g_class(request, mode)

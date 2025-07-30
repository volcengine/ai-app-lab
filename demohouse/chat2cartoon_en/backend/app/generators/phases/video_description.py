import time
from typing import AsyncIterable

from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, ArkMessage, ArkChatCompletionChunk
from arkitect.utils.context import get_reqid, get_resource_id
from arkitect.core.errors import InvalidParameter
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase, PhaseFinder
from app.generators.phases.common import get_correction_completion_chunk
from app.logger import ERROR
from app.mode import Mode
from app.output_parsers import parse_video_description

VIDEO_DESCRIPTION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# # Role
You are a Descriptor Generator.
Your job is to generate descriptive keywords for video scenes based on storyboard information (phase: "StoryBoard") and first-frame action/state change descriptions (phase: "FirstFrameDescription") from the conversation history.
These descriptors will be used for the next step in generating videos.
 
 # Constraints

- Do not use any vocabulary that is inappropriate for children, suggestive, prohibited, or pornographic.
- Do not use phrases that imply physical contact with the child.
- Do not ask for or mention any sensitive information, such as home addresses.
- Do not include dialogue lines in the output.

# Task Description & Requirements

- Carefully analyze storyboard and first-frame information to extract dynamic changes and character actions.
-- Structure the description by Scene → Character(s) → Action(s).
-- Example: Medium shot, Character 1, action 1, action 2, Character 2, action 3.
- Focus only on dynamic actions, movement, and visible transitions — ignore static visual traits.
- Maintain a strict one-to-one correspondence between video numbers and storyboard numbers.
--Total number of video descriptions must match total storyboard scenes.
---Ensure a one-to-one correspondence between video descriptions and storyboard scenes.
- Keep the descriptions clear, concise, and formatted according to the structure below.
- [IMPORTANT] If the user prompt is processed successfully, prepend the entire response with:
"phase=VideoDescription"

## Respond using the following format:

phase=VideoDescription
Video 1:
Characters: Little Bear
Description: Close-up shot, the little bear, runs over, waves its hand, a light drizzle begins to fall from the sky.
Video 2:
Characters: Little Cat
Description: Long shot, the little cat, sits in thought, then stands up, throws away the book in its hand, turns around to play with a ball.
Video 3:
Characters: Rabbit, Tiger
Description: Medium shot, the rabbit, first spins in a circle, then starts singing, the tiger, paces back and forth to the side.
Video 4:
Characters: Water Buffalo
Description: Medium shot, the water buffalo, rubs its eyes with its little hands, starts crying aggrievedly, then, on the bed, hugs a blanket and tosses and turns, constantly changing positions, appearing very distressed and helpless.
Video 5:
Characters: Little Rabbit
Description: Close-up shot, the little rabbit, stares intently at the TV screen, an animation is playing on the TV.
Video 6:
Description: Close-up shot, the little fox, gets up, takes out the TV remote to turn off the TV while walking towards the bed.

Final Note
Each video description must directly correspond to one specific storyboard scene.

The total number of video descriptions must exactly match the total number of storyboard scenes from the "StoryBoard" phase.
Do not omit any scene.

If the input meets these requirements, prepend the output with "phase=VideoDescription" as the prefix.
"""
)


class VideoDescriptionGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode
    phase_finder: PhaseFinder

    def __init__(self, request: ArkChatRequest, mode: Mode.NORMAL):
        super().__init__(request, mode)

        chat_endpoint_id = LLM_ENDPOINT_ID
        if request.metadata:
            chat_endpoint_id = request.metadata.get("chat_endpoint_id", LLM_ENDPOINT_ID)

        self.llm_client = LLMClient(chat_endpoint_id)
        self.phase_finder = PhaseFinder(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        if self.mode == Mode.CORRECTION:
            yield get_correction_completion_chunk(self.request.messages[-1], Phase.VIDEO_DESCRIPTION)
        else:
            script = self.phase_finder.get_script()
            storyboards, _ = self.phase_finder.get_storyboards()
            role_descriptions = self.phase_finder.get_role_descriptions()
            first_frame_descriptions_text, first_frame_descriptions = self.phase_finder.get_first_frame_descriptions()

            if len(script) == 0:
                ERROR("script not found")
                raise InvalidParameter("script not found")

            if len(role_descriptions) == 0:
                ERROR("role descriptions not found")
                raise InvalidParameter("messages", "role descriptions not found")

            if len(storyboards) == 0:
                ERROR("storyboards not found")
                raise InvalidParameter("messages", "storyboards not found")

            if len(first_frame_descriptions) == 0:
                ERROR("first frame description not found")
                raise InvalidParameter("messages", "first frame description not found")

            messages = [
                VIDEO_DESCRIPTION_SYSTEM_PROMPT,
                ArkMessage(role="assistant", content=f"phase={Phase.SCRIPT.value}\n{script}"),
                ArkMessage(role="user", content="下一步"),
                ArkMessage(role="assistant", content=f"phase={Phase.STORY_BOARD.value}\n{storyboards}"),
                ArkMessage(role="user", content="下一步"),
                ArkMessage(role="assistant", content=f"phase={Phase.ROLE_DESCRIPTION.value}\n{role_descriptions}"),
                ArkMessage(role="user", content="下一步"),
                ArkMessage(role="assistant",
                           content=f"phase={Phase.FIRST_FRAME_DESCRIPTION.value}\n{first_frame_descriptions_text}"),
                ArkMessage(role="user",
                           content=f"生成分镜视频的内容描述。需要生成的视频描述数量是{len(first_frame_descriptions)}个"),
            ]

            if self.mode == Mode.REGENERATION:
                completion = ""
                async for chunk in self.llm_client.chat_generation(messages):
                    if not chunk.choices:
                        continue
                    completion += chunk.choices[0].delta.content

                new_video_descriptions = parse_video_description(completion)

                previous_video_descriptions = self.phase_finder.get_video_descriptions()
                new_content = ""
                for index, pvd in enumerate(previous_video_descriptions):
                    if not pvd.description:
                        pvd.description = new_video_descriptions[index].description
                        pvd.characters = new_video_descriptions[index].characters
                    new_content += f"{pvd.to_content(index + 1)}\n"

                yield ArkChatCompletionChunk(
                    id=get_reqid(),
                    choices=[
                        Choice(
                            index=0,
                            delta=ChoiceDelta(
                                role="assistant",
                                content=f"phase={Phase.VIDEO_DESCRIPTION.value}\n\n{new_content}",
                            ),
                        ),
                    ],
                    created=int(time.time()),
                    model=get_resource_id(),
                    object="chat.completion.chunk"
                )
                yield ArkChatCompletionChunk(
                    id=get_reqid(),
                    choices=[Choice(
                        index=1,
                        finish_reason="stop",
                        delta=ChoiceDelta(
                            role="assistant",
                            finish_reason="stop",
                            content="",
                        )
                    )],
                    created=int(time.time()),
                    model=get_resource_id(),
                    object="chat.completion.chunk"
                )

            else:
                async for resp in self.llm_client.chat_generation(messages):
                    yield resp

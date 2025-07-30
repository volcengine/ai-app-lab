import time
from typing import AsyncIterable

from arkitect.core.component.llm.model import ArkMessage, ArkChatRequest, ArkChatResponse, ArkChatCompletionChunk
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
from app.output_parsers import parse_first_frame_description

FIRST_FRAME_DESCRIPTION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 
# Role
You are a Visual Description Optimizer. Based on the story content, storyboard scenes (marked as "StoryBoard"), and character information (marked as "RoleDescription") from the conversation history, you will optimize and generate the first-frame visual description for each scene according to the following rules.

# Task Description & Requirements

- Style: "Cartoon-style illustration, child-friendly cute aesthetic, 3D rendered."
- Each first-frame description must be concise and clear, no more than 200 characters.
- Each description must explicitly include the scene/location information.
- All character names must be listed exactly as they appear in the "RoleDescription", and must match the characters enumerated in each StoryBoard scene.
- The number of first-frame descriptions must strictly match the number of scenes in the "StoryBoard".
- [Important] If the user input appears valid and complete, prepend the output with "phase=FirstFrameDescription".

# Reference Example


The user's historical input includes the following information:

Character: Baby Bear, brown fluffy fur, small ears, and black eyes. Attire: Blue hat, brown vest with a yellow star pattern (in the forest).
Character: Little Fox, pointy ears, and cunning eyes. Attire: Red cloak with gold embroidery (in the forest).
Character: Little Bird, colorful feathers, pointy beak, and round eyes. Attire: White vest (on a big tree branch).
Storyboard 1:
Characters: Baby Bear
Scene: In the forest, a fluffy little bear with small ears and bright black eyes, wearing a blue hat and a brown vest with a yellow star pattern, walks happily towards a large tree.
Dialogue: "I'm going to find some honey."
Storyboard 2:
Characters: Little Fox, Baby Bear
Scene: In the forest, a fox with pointy ears and cunning eyes, wearing a red cloak (embroidered with golden patterns), smirks after seeing Baby Bear.
Dialogue: "Hehe, I'm going to play a trick on this little bear."

Respond using the following format:

phase=FirstFrameDescription
Storyboard 1:
Characters: Baby Bear
First Frame Description: A 3D cartoon-style forest scene. A Baby Bear with brown fluffy fur, small ears, black eyes, wearing a blue hat and a brown vest with a yellow star pattern, walks happily towards a large tree. Cute and child-like style, 3D render.
Storyboard 2:
Characters: Little Fox, Baby Bear
First Frame Description: A 3D cartoon-style forest scene. A Little Fox with pointy ears and cunning eyes, wearing a red cloak with gold embroidery, smirks as it sees the Baby Bear, who has brown fluffy fur, small ears, black eyes, and is wearing a blue hat and a brown vest with a yellow star pattern. Cute and child-like style, 3D render.

# Constraints

- Strictly follow the optimization requirements; do not modify the character description information.
- A character's attire may be slightly adjusted to fit the scene, but must preserve the original core design and visual coherence.
- Do not modify the style.
- Ensure the scene description matches the action description and includes any necessary props from the current storyboard.
- Ensure the scene description accurately reflects the characteristics of a "cartoon illustration," "cute and child-like style," and "3D render."
- Do not use any vocabulary that is inappropriate for children, suggestive, prohibited, or pornographic.
- Do not include any phrases implying physical interaction with a child.
- Do not ask for sensitive information like home addresses.
"""
)


class FirstFrameDescriptionGenerator(Generator):
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
            yield get_correction_completion_chunk(self.request.messages[-1], Phase.FIRST_FRAME_DESCRIPTION)
        else:
            script = self.phase_finder.get_script()
            storyboards, _ = self.phase_finder.get_storyboards()
            role_descriptions = self.phase_finder.get_role_descriptions()

            if len(script) == 0:
                ERROR("script not found")
                raise InvalidParameter("script not found")

            if len(role_descriptions) == 0:
                ERROR("role descriptions not found")
                raise InvalidParameter("messages", "role descriptions not found")

            if len(storyboards) == 0:
                ERROR("storyboards not found")
                raise InvalidParameter("messages", "storyboards not found")

            messages = [
                FIRST_FRAME_DESCRIPTION_SYSTEM_PROMPT,
                ArkMessage(role="assistant", content=f"phase={Phase.SCRIPT.value}\n{script}"),
                ArkMessage(role="user", content="下一步"),
                ArkMessage(role="assistant", content=f"phase={Phase.STORY_BOARD.value}\n{storyboards}"),
                ArkMessage(role="user", content="下一步"),
                ArkMessage(role="assistant", content=f"phase={Phase.ROLE_DESCRIPTION.value}\n{role_descriptions}"),
                ArkMessage(role="user", content=f"生成首帧视频画面的内容描述。"),
            ]

            if self.mode == Mode.REGENERATION:
                completion = ""
                async for chunk in self.llm_client.chat_generation(messages):
                    if not chunk.choices:
                        continue
                    completion += chunk.choices[0].delta.content

                new_first_frame_descriptions = parse_first_frame_description(completion)

                _, previous_first_frame_descriptions = self.phase_finder.get_first_frame_descriptions()
                new_content = ""
                for index, pffi in enumerate(previous_first_frame_descriptions):
                    if not pffi.description:
                        pffi.description = new_first_frame_descriptions[index].description
                        pffi.characters = new_first_frame_descriptions[index].characters
                    new_content += f"{pffi.to_content(index + 1)}\n"

                yield ArkChatCompletionChunk(
                    id=get_reqid(),
                    choices=[
                        Choice(
                            index=0,
                            delta=ChoiceDelta(
                                content=f"phase={Phase.FIRST_FRAME_DESCRIPTION.value}\n\n{new_content}",
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

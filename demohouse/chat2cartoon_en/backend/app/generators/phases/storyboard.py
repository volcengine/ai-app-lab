from typing import AsyncIterable

from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, ArkMessage

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID, MAX_STORY_BOARD_NUMBER
from app.generators.base import Generator
from app.generators.phase import Phase, PhaseFinder
from app.generators.phases.common import get_correction_completion_chunk
from app.mode import Mode

STORY_BOARD_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content=f"""

# Role
You are the Story Master. Based on a given story theme, you will generate bedtime storyboards suitable for children aged 3 to 6.

# Task Description & Requirements
- Based on the story, generate a sequence of storyboard scenes. For each scene, list:
-- Characters: Enumerate all characters appearing in the scene. If multiple characters of the same type appear (e.g., three puppies), list them separately with distinct names (e.g., First Puppy, Second Puppy, Third Puppy).
-- Visual Description: Describe what is shown in the scene.
--Dialogue: Provide both Chinese and English lines for the scene.
---Important: Each scene must contain dialogue in both languages, but only one character's dialogue per scene.
- Each output must start with the prefix: "phase=StoryBoard"

# Constraints
- Do not include complex or frightening plots.
- The total number of storyboard scenes must be 10 or fewer.
- Character names must be used exactly as given in the story. Do not merge, rename, or alter them.
- Chinese dialogue must be no more than 30 characters long.
- The main character must not wear revealing clothing (e.g., no crop tops or bikinis).
- Do not include any inappropriate, suggestive, or prohibited content.
- Do not include any sentences involving physical contact with children.
- Do not ask for sensitive information such as home addresses.

# Reference Example
Example Input 1:
Title: The Little Bear's Adventure

Story:
Deep in the forest lived a cute little bear named Beibei. It was fluffy all over, with small ears and bright black eyes. One day, the little bear put on its blue hat and its brown vest with yellow star patterns and set off to find some honey. It walked past a meadow full of mushrooms and came to a huge tree with a big beehive on it. Beibei rubbed its paws excitedly, ready to enjoy the delicious honey.

There was also a little fox, who was clever and sly, with pointy ears and a cunning glint in its eyes. It wore a red cloak embroidered with golden patterns (in the forest). When the little fox saw the bear looking for honey, it decided to play a little trick on it.

At the same time, there was a kind little bird in the forest. The bird had colorful feathers, a pointy beak, and round eyes. It wore a little white vest (on a big tree branch). When the little bird saw that the fox wanted to trick Beibei, it decided to help him.

Character 1: Beibei the Bear, brown fur, fluffy, small ears, black eyes. Attire: Blue hat, brown vest with yellow star patterns (in the forest)
Character 2: Little Fox, pointy ears, cunning eyes. Attire: Red cloak with golden embroidery (in the forest)
Character 3: Little Bird, colorful feathers, pointy beak, round eyes. Attire: White vest (on a big tree branch)

Respond using the following format (Characters, Scene, Chinese Dialogue, and English Dialogue must each be on a new line):
Storyboard 1:
Characters: Beibei the Bear
Scene: In the forest, a fluffy little bear with small ears and bright black eyes, wearing a blue hat and a brown vest with yellow star patterns, walks happily towards a large tree.
Chinese Dialogue: “我要去找蜂蜜吃啦。”
English Dialogue: "I'm going to find some honey."

Storyboard 2:
Characters: Little Fox, Beibei the Bear
Scene: In the forest, a fox with pointy ears and cunning eyes, wearing a red cloak (embroidered with golden patterns), peeks out and smirks after seeing Beibei the Bear.
Chinese Dialogue: “嘿嘿，我来捉弄一下这只小熊。”
English Dialogue: "Hehe, I'm going to play a trick on this little bear."

Storyboard 3:
Characters: Little Bird
Scene: On a large tree branch, a bird with colorful feathers, a pointy beak, round eyes, and wearing a white vest, sees the expression on the fox's face.
Chinese Dialogue: “小狐狸又想做坏事，我要帮帮小熊。”
English Dialogue: "The fox is up to no good again, I have to help the little bear."

# Final Note
- - Ensure that only one character's dialogue is included per scene.
- If the input meets the above specifications, prepend the output with "phase=StoryBoard" as the prefix.
"""
)


class StoryBoardGenerator(Generator):
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
        self.request = request
        self.mode = mode
        self.phase_finder = PhaseFinder(request)

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        if self.mode == Mode.CORRECTION:
            yield get_correction_completion_chunk(self.request.messages[-1], Phase.STORY_BOARD)
        else:
            _, script_message = self.phase_finder.get_phase_message(Phase.SCRIPT)
            messages = [
                STORY_BOARD_SYSTEM_PROMPT,
                script_message,
                self.request.messages[-1],
            ]

            async for resp in self.llm_client.chat_generation(messages):
                yield resp

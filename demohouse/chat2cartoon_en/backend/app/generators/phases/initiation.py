from typing import AsyncIterable

from arkitect.core.component.llm.model import ArkChatRequest, ArkMessage, ArkChatResponse
from arkitect.core.errors import InternalServiceError

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase
from app.generators.phases.role_description import RoleDescriptionGenerator
from app.generators.phases.script import ScriptGenerator
from app.generators.phases.storyboard import StoryBoardGenerator
from app.logger import ERROR, INFO
from app.mode import Mode

INITIATION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""
    #Role

You are a Classification Master. Your task is to accurately classify user input into one of three categories based on their intent.

#Task & Requirements

Perform a 3-way classification.
The categories are Script, StoryBoard, and RoleDescription.
The categories follow a logical sequence: Script -> StoryBoard -> RoleDescription.

# Classification Rules

Return Script if the user asks to tell a story, requests optimizations (e.g., "make it richer"), or makes small talk.
Return StoryBoard if and only if the user explicitly asks to create or modify a storyboard.
Return RoleDescription if and only if the user explicitly asks to create a character or generate a video.
For any input not covered by rules 2 or 3, default to returning Script.

# Output Constraints

You must strictly follow all rules.
Your output MUST BE a single word: Script, StoryBoard, or RoleDescription.
Do not add any other text, explanations, or punctuation.

# Examples

## Example 1:
User: "Tell me a story"
Output: Script
## Example 2:
User: "Make it richer"
Output: Script
## Example 3:
User: "Change the story, the new one is about xxx"
Output: Script
## Example 4:
User: "Now design the storyboard"
Output: StoryBoard
## Example 5:
User: "Add more tasks to storyboard 4"
Output: StoryBoard
## Example 6:
User: "Start generating the video"
Output: RoleDescription
## Example 7 (Context: The previous step was StoryBoard):
User: "Next step"
Output: RoleDescription
## Example 8 (Context: The previous step was NOT StoryBoard):
User: "Next step"
Output: StoryBoard
## Example 9:
User: "Create a character description"
Output: RoleDescription
"""
)


class InitiationGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode.NORMAL):
        super().__init__(request, mode)

        chat_endpoint_id = LLM_ENDPOINT_ID
        if request.metadata:
            chat_endpoint_id = request.metadata.get("chat_endpoint_id", LLM_ENDPOINT_ID)

        self.llm_client = LLMClient(chat_endpoint_id)
        self.request = request
        self.mode = mode

    async def _get_actual_generator(self) -> Generator:
        messages = [
            INITIATION_SYSTEM_PROMPT,
        ]
        messages.extend(self.request.messages)

        completion = ""
        async for chunk in self.llm_client.chat_generation(messages):
            if not chunk.choices:
                continue
            completion += chunk.choices[0].delta.content

        INFO(f"Initiation completion: {completion}")
        INFO(f"Is SCRIPT in completion? {Phase.SCRIPT.value in completion}")
        INFO(f"Is STORY_BOARD in completion? {Phase.STORY_BOARD.value in completion}")
        INFO(f"Is ROLE_DESCRIPTION in completion? {Phase.ROLE_DESCRIPTION.value in completion}")

        if Phase.SCRIPT.value in completion:
            actual_generator = ScriptGenerator(self.request, self.mode)
        elif Phase.STORY_BOARD.value in completion:
            actual_generator = StoryBoardGenerator(self.request, self.mode)
        elif Phase.ROLE_DESCRIPTION.value in completion:
            actual_generator = RoleDescriptionGenerator(self.request, self.mode)
        else:
            ERROR(f"failed to determine the phase, phase given by the llm is {completion}")
            raise InternalServiceError("failed to determine the phase")

        return actual_generator

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        actual_generator = await self._get_actual_generator()
        async for resp in actual_generator.generate():
            yield resp

import json
import time
from typing import AsyncIterable

from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, ArkMessage, ArkChatCompletionChunk
from arkitect.utils.context import get_reqid, get_resource_id
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase, PhaseFinder
from app.generators.phases.common import get_correction_completion_chunk
from app.logger import INFO
from app.mode import Mode
from app.output_parsers import parse_tone

TONE_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""
# Role
You are an expert Voice Casting Director for children's stories.

# Primary Task:
Your task is to cast voices for a storyboard. For each character, assign the most suitable Voice ID from the list below and specify their emotion for each scene.

# Candidate Voice IDs:
zh_male_shaonianzixin_moon_bigtts        Ethan
zh_male_jingqiangkanye_moon_bigtts        Thomas
en_male_adam_mars_bigtts        Adam
zh_male_wennuanahu_moon_bigtts        Mark
zh_male_jieshuonansheng_mars_bigtts        James
zh_male_silang_mars_bigtts        William
en_male_smith_mars_bigtts        Smith
en_male_dryw_mars_bigtts        Dryw
zh_female_mengyatou_mars_bigtts        Ava
zh_female_qiaopinvsheng_mars_bigtts        Mia
zh_female_linjia_mars_bigtts        Lily
zh_female_shuangkuaisisi_moon_bigtts        Aria
zh_female_cancan_mars_bigtts        Luna
zh_female_tiexinnvsheng_mars_bigtts        Sophia
zh_female_jitangmeimei_mars_bigtts        Grace
en_female_anna_mars_bigtts        Anna
en_female_sarah_mars_bigtts        Sarah
zh_female_shaoergushi_mars_bigtts        Tina

# Instructions & Constraints:

1. Logical Casting: Selections must be based on the character's gender, personality, and the context of the scene.
2. Voice Consistency: A single character must be assigned the same Voice ID throughout the entire story.
3. Output Format: For each storyboard, list the characters with dialogue in this storyboard and their Vocie ID.
4. Strictly No Explanations: Do not provide any reasons, justifications, or other descriptive text. Your output must only contain the formatted cast list.

# Example

## Example Input
Storyboard 1:
Characters: Little Bear Cubbie, Mama Bear
Scene: In the living room, Cubbie is playing with a plush rabbit on a soft carpet. Sunlight filters through the window, casting warm spots. Mama Bear stands at the doorway, smiling gently.
Chinese Dialogue: “小库比，月亮要出来站岗啦，该和妈妈去刷牙咯！”
English Dialogue: "Little Cubbie, the moon is about to come out to stand guard—it’s time to come brush your teeth with Mama!"

Storyboard 2:
Characters: Little Bear Cubbie, Mama Bear
Scene: In a cozy forest home, Mama Bear gently holds a bright yellow toothbrush with a tiny blue star, while Little Bear Cubbie wiggles away with a pout.
Chinese Dialogue: “不嘛妈妈！刷牙好无聊呀！”
English Dialogue: "No, Mama! Brushing is boring!"

Storyboard 3:
Characters: Little Bear Cubbie, Sparkle
Scene: At night, Cubbie is snuggled in bed, and the blue star on his yellow toothbrush twinkles. The toothbrush grows small wings and flutters to Cubbie’s nose, glowing softly.
Chinese Dialogue: “你好呀，小库比！我是魔法牙刷闪闪！”
English Dialogue: "Hello, Cubbie! I'm Sparkle, your magic toothbrush!"

## Example Output
Storyboard 1:
Chinese Dialogue: “小库比，月亮要出来站岗啦，该和妈妈去刷牙咯！”
English Dialogue: "Little Cubbie, the moon is about to come out to stand guard—it’s time to come brush your teeth with Mama!"
Voice：zh_female_wennuanahu_moon_bigtts


Storyboard 2:
Chinese Dialogue: “不嘛妈妈！刷牙好无聊呀！”
English Dialogue: "No, Mama! Brushing is boring!"
Voice：zh_male_shaonianzixin_moon_bigtts

Storyboard 3：
Chinese Dialogue: “你好呀，小库比！我是魔法牙刷闪闪！”
English Dialogue: "Hello, Cubbie! I'm Sparkle, your magic toothbrush!"
Voice：zh_female_mengyatou_mars_bigtts
"""
)


class ToneGenerator(Generator):
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
            yield get_correction_completion_chunk(self.request.messages[-1], Phase.TONE)
        else:
            storyboard, _ = self.phase_finder.get_storyboards()
            messages = [
                TONE_SYSTEM_PROMPT,
                ArkMessage(role="user", content=storyboard),
            ]
            INFO(f"storyboard num: {len(storyboard)}")

            completion = ""
            async for chunk in self.llm_client.chat_generation(messages):
                if not chunk.choices:
                    continue
                completion += chunk.choices[0].delta.content

            tones = parse_tone(completion)
            tones_json = {
                "tones": [t.model_dump() for t in tones]
            }

            yield ArkChatCompletionChunk(
                id=get_reqid(),
                choices=[
                    Choice(
                        index=0,
                        delta=ChoiceDelta(
                            role="assistant",
                            content=f"phase={Phase.TONE.value}\n\n{json.dumps(tones_json)}",
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
                        content="",
                    )
                )],
                created=int(time.time()),
                model=get_resource_id(),
                object="chat.completion.chunk"
            )

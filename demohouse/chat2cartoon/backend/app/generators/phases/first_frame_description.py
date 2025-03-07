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

import time
from typing import AsyncIterable

from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase
from app.mode import Mode
from app.output_parsers import OutputParser, parse_first_frame_description
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
)
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR
from arkitect.utils.context import get_reqid, get_resource_id

FIRST_FRAME_DESCRIPTION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 角色
你是画面描述优化师，你将根据对话记录中Phase为StoryBoard和RoleDescription提供的故事内容、分镜信息、角色信息描述，按照以下规则进行画面描述的优化，并且生成首帧视频画面的内容描述。
# 任务描述与要求
- 风格：“卡通风格插图，幼儿可爱风格，3D 渲染”。
- 每个分镜的首帧描述要简洁明了，字数不超过 200 字。
- 每个分镜的描述中必须包含场景信息。
- 每个分镜的描述中必须按照枚举出现的角色名称，且与「RoleDescription」中的角色名称保持一致。
- 分镜数量需要和「StoryBoard」中的分镜数量严格保持一致
- [重要] 如果用户提示词内容没问题，在正常返回结果前加上"phase=FirstFrameDescription"的前缀。

# 参考示例
## 用户历史输入包括以下信息：
1. 角色：小熊宝宝，棕色绒毛，毛茸茸的，小耳朵黑眼睛。服饰：蓝色小帽子、黄色星星图案棕色背心（森林里）
2. 角色：小狐狸，尖耳狡黠眼。服饰：红色绣金纹披风（森林里）
3. 角色：小鸟，五彩羽毛，尖嘴圆眼。服饰：白色小马甲（大树枝上）

分镜1：
角色：小熊宝宝
画面：森林里，一只毛茸茸、耳朵小小的、眼睛黑亮黑亮的小熊戴着蓝色小帽子，穿着带有黄色星星图案的棕色背心，欢快地走向一棵大树。
台词：“我要去找蜂蜜吃啦。”
分镜2：
角色：小狐狸，小熊宝宝
画面：森林里，尖耳朵、眼睛透着狡黠的小狐狸穿着红色披风（上面绣着金色花纹），看到小熊宝宝后露出坏笑。
台词：“嘿嘿，我来捉弄一下这只小熊。”

##输出按照以下格式回答：
phase=FirstFrameDescription
分镜1：
角色：小熊宝宝
首帧描述：卡通风格插图，森林里，一只棕色绒毛，毛茸茸的，小耳朵黑眼睛，戴着蓝色小帽，穿着带黄色星星图案的棕色背心的的小熊宝宝，欢快地走向大树，幼儿可爱风格，3D渲染。

分镜2：
角色：小狐狸，小熊宝宝
首帧描述：卡通风格插图，森林里，尖耳狡黠眼的小狐狸穿着绣有金色花纹的红色披风，看到棕色绒毛，毛茸茸的，小耳朵黑眼睛，戴着蓝色小帽，穿着带黄色星星图案的棕色背心的的小熊宝宝，后露出坏笑，幼儿可爱风格，3D渲染。

# 相关限制
- 严格按照要求进行优化，禁止修改角色描述信息。
- 角色的服饰信息需要根据角色所在的场景进行调整，但需要保持和谐。
- 严禁修改风格。
- 确保画面描述符合动作描述，并保障有当前分镜中必须存在的道具。
- 确保画面描述符合卡通风格、幼儿可爱风格和 3D 渲染效果的特点。
- 不能出现少儿不宜、擦边、违禁、色情的词汇。
- 不能回复与小朋友有接触的语句。
- 不能询问家庭住址等敏感信息。
""",
)


class FirstFrameDescriptionGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode
    output_parser: OutputParser

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.llm_client = LLMClient(LLM_ENDPOINT_ID)
        self.output_parser = OutputParser(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # extract script, storyboard and role description to use as context for first
        # frame description generation
        script = self.output_parser.get_script()
        storyboards, _ = self.output_parser.get_storyboards()
        role_descriptions = self.output_parser.get_role_descriptions()

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
            ArkMessage(
                role="assistant", content=f"phase={Phase.SCRIPT.value}\n{script}"
            ),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(
                role="assistant",
                content=f"phase={Phase.STORY_BOARD.value}\n{storyboards}",
            ),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(
                role="assistant",
                content=f"phase={Phase.ROLE_DESCRIPTION.value}\n{role_descriptions}",
            ),
            ArkMessage(role="user", content=f"生成首帧视频画面的内容描述。"),
        ]

        if self.mode == Mode.CONFIRMATION:
            async for resp in self.llm_client.chat_generation(messages):
                yield resp
        else:  # self.mode == Mode.REGENERATION:
            completion = ""
            async for chunk in self.llm_client.chat_generation(messages):
                if not chunk.choices:
                    continue
                completion += chunk.choices[0].delta.content
            new_first_frame_descriptions = parse_first_frame_description(completion)

            # user request can include first_frame_descriptions field containing a list of descriptions they don't
            # want regenerated, handle case by only filling in empty descriptions with the newly generated first
            # frame descriptions
            (
                _,
                previous_first_frame_descriptions,
            ) = self.output_parser.get_first_frame_descriptions()
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
                            content=f"phase={Phase.FIRST_FRAME_DESCRIPTION.value}\n\n{new_content}"
                        ),
                    ),
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
                        delta=ChoiceDelta(content=""),
                    )
                ],
                created=int(time.time()),
                model=get_resource_id(),
                object="chat.completion.chunk",
            )

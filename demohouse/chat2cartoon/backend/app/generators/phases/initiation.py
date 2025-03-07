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

from typing import AsyncIterable

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase
from app.generators.phases.role_description import RoleDescriptionGenerator
from app.generators.phases.script import ScriptGenerator
from app.generators.phases.storyboard import StoryBoardGenerator
from app.mode import Mode
from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, ArkMessage
from arkitect.core.errors import InternalServiceError
from arkitect.telemetry.logger import ERROR, INFO

INITIATION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 角色
你是一个分类大师，你将根据客户的输入准确判断其意图。
# 任务描述与要求
1. 进行 3 分类。
2. 分类包括 Script 生成故事脚本，StoryBoard 生成故事分镜设计，RoleDescription 生成角色描述信息
3. 3种类别之间有先后顺序，Script -> StoryBoard -> RoleDescription
4. 如果用户要求讲一个故事、做优化或闲聊等，返回“Script”，不能添加其他信息。
5. 当且仅当用户要求进行分镜创作时，返回“StoryBoard”，不能添加其他信息。
6. 当且仅当用户要求进行角色创作、生成视频时，返回“RoleDescription”，不能添加其他信息。
7. 除了以上情况外，都返回“Script”，不能添加其他信息。

# 相关限制
1. 严格按照规则进行分类输出。
2. 忽略历史对话中assistant返回的格式，你的下一次回答严格只能返回“Script”、“StoryBoard”、“RoleDescription”中的唯一一个单词。

# 参考示例
示例 1：
用户：讲一个故事
输出：Script
示例 2：
用户：更丰富一些
输出：Script
示例 3：
用户：换一个故事，新的故事是关于xxx
输出：Script
示例 4:
用户：现在设计分镜
输出：StoryBoard
示例 5:
用户：分镜4多加几个任务
输出：StoryBoard
示例 6:
用户：开始生成视频
输出：RoleDescription
示例 7（如果前面已经有StoryBoard了）:
用户：下一步
输出：RoleDescription
示例 8（如果前面还没有Storyboard）：
用户：下一步
输出：StoryBoard
示例 9：
用户：创作人物角色描述
输出：RoleDescription

""",
)


class InitiationGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.llm_client = LLMClient(LLM_ENDPOINT_ID)
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

        if Phase.SCRIPT.value in completion:
            actual_generator = ScriptGenerator(self.request, self.mode)
        elif Phase.STORY_BOARD.value in completion:
            actual_generator = StoryBoardGenerator(self.request, self.mode)
        elif Phase.ROLE_DESCRIPTION.value in completion:
            actual_generator = RoleDescriptionGenerator(self.request, self.mode)
        else:
            ERROR(
                f"failed to determine the phase, phase given by the llm is {completion}"
            )
            raise InternalServiceError("failed to determine the phase")

        return actual_generator

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        actual_generator = await self._get_actual_generator()
        async for resp in actual_generator.generate():
            yield resp

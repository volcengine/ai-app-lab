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
from app.generators.phase import Phase, PhaseFinder
from app.mode import Mode
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
)
from arkitect.utils.context import get_reqid, get_resource_id

ROLE_DESCRIPTION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 角色
你是一个故事视频自动生成器的其中一个步骤，你的任务是根据对话记录中最新的Phase为Script和StoryBoard提供的故事内容，分镜设计，生成与之对应的角色描述。
用户可能会要求你生成视频，此时你应该生成角色描述，后续会有其他模型基于你生成的角色描述来生成对应的内容。

# 要求
- 整体风格为卡通风格插图，充满幼儿可爱风格，且采用3D渲染效果。
- 每个角色的描述需简洁明了，不超过30个字，包含面部特征等必要细节。
- 每个角色都需要描述角色的具体服饰细节信息和地点。
- 角色数量：1-4。
- [重要] 如果用户提示词内容没问题，在正常返回结果前加上"phase=RoleDescription"的前缀。

# 相关限制
- 不能出现少儿不宜、擦边、违禁、色情的词汇。
- 不能回复与小朋友有接触的语句。
- 不能询问家庭住址等敏感信息。
- 不需要为返回结果添加phase=xxx的前缀

# 输出按照以下格式回答（角色数量介于1-4之间，如果只有1个角色，只需要写角色1即可。）：
角色1：
角色：小熊
角色描述：小熊，圆头圆脑，小黑鼻。服饰：蓝色小帽与黄色星图棕背心（森林）
角色2：
角色：小狐狸
角色描述：小狐狸，尖脸尖耳，细长眼。服饰：绣金纹红披风（森林）
角色3：
角色：小鸟
角色描述：小鸟，小巧玲珑，圆眼珠。服饰：白色小肚兜（树枝上）
""",
)


class RoleDescriptionGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode
    phase_finder: PhaseFinder

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.llm_client = LLMClient(LLM_ENDPOINT_ID)
        self.request = request
        self.mode = mode
        self.phase_finder = PhaseFinder(request)

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # extract script and storyboard text from the user request
        _, script_message = self.phase_finder.get_phase_message(Phase.SCRIPT)
        _, storyboard_message = self.phase_finder.get_phase_message(Phase.STORY_BOARD)

        # send first stream
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.ROLE_DESCRIPTION.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        # attach system prompt at the start of the LLM request
        # attach script and storyboard as the context for the role description generation
        messages = [
            ROLE_DESCRIPTION_SYSTEM_PROMPT,
            script_message,
            storyboard_message,
            self.request.messages[-1],
        ]

        async for resp in self.llm_client.chat_generation(messages):
            yield resp

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
from app.constants import LLM_ENDPOINT_ID, MAX_STORY_BOARD_NUMBER
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

STORY_BOARD_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content=f"""角色
你是故事大王，你将根据客户提供的故事主题，为 3-6 岁的小朋友生成睡前故事分镜。
# 任务描述与要求
- 根据故事内容，生成分镜描述，需要以此枚举当前分镜中出现的角色列表、画面、台词。例如：角色：兔子妈妈、小兔子跳跳、第一只小狗、第二只小狗、第三只小狗。
- 如果同一个分镜中出现了多个相同角色，需要分别输出他们的名字，不要合并。
- 台词需要生成中文版和英文版。
- 每个分镜必须都有台词。
- 不需要为返回结果添加phase=xxx的前缀

# 相关限制
- 不要出现过于复杂或恐怖的情节。
- 分镜数量不超过{MAX_STORY_BOARD_NUMBER}个。
- 即使分镜中有多个角色出现，单个分镜只包含一个角色的台词。
- 依次枚举的角色名称要严格和故事中的角色名称保持一致，禁止合并或修改。
- 中文台词不超过30个字。
- 故事主角不能穿着暴露（比如肚兜，比基尼）。
- 不能出现少儿不宜、擦边、违禁、色情的词汇。
- 不能回复与小朋友有接触的语句。
- 不能询问家庭住址等敏感信息。

# 参考示例
## 示例输入1：
《小熊的冒险之旅》

在森林深处有一只可爱的小熊贝贝，它全身毛茸茸的，耳朵小小的，眼睛黑亮黑亮的。一天，小熊戴着它的蓝色小帽子，穿着带有黄色星星图案的棕色背心出发去寻找蜂蜜。它走过了长满蘑菇的草地，来到了一棵巨大的树下，那树上有个大大的蜂窝。小熊贝贝兴奋地搓搓手，准备享受美味的蜂蜜。

还有一只小狐狸，它机灵又狡猾，尖尖的耳朵，眼睛里透着狡黠的光。它穿着一件红色的披风，上面绣着金色的花纹（森林里）。小狐狸看到小熊在找蜂蜜，就想捉弄它一下。

同时，森林里还有一只善良的小鸟，小鸟的羽毛五彩斑斓，嘴巴尖尖的，眼睛圆圆的。它身穿一件白色的小马甲（大树枝上）。小鸟看到小狐狸想捉弄小熊贝贝，就决定帮助小熊贝贝。

角色1：小熊贝贝，棕色绒毛，毛茸茸，小耳朵黑眼睛。服饰：蓝色小帽子、黄色星星图案棕色背心（森林里）
角色2：小狐狸，尖耳朵、眼睛透着狡黠。服饰：红色绣金纹披风（森林里）
角色3：小鸟，五彩羽毛，尖嘴圆眼。服饰：白色小马甲（大树枝上）

## 输出按照以下格式回答（角色、画面、中文台词、英文台词分别各占一行）：
分镜1：
角色：小熊贝贝
画面：森林里，一只毛茸茸、耳朵小小的、眼睛黑亮黑亮的小熊戴着蓝色小帽子，穿着带有黄色星星图案的棕色背心，欢快地走向一棵大树。
中文台词：“我要去找蜂蜜吃啦。”
英文台词："I'm going to find the honey."

分镜2：
角色：小狐狸，小熊贝贝
画面：森林里，尖耳朵、眼睛透着狡黠的小狐狸穿着红色披风（上面绣着金色花纹），看到小熊贝贝后露出坏笑。
中文台词：“嘿嘿，我来捉弄一下这只小熊。”
英文台词："Hey, I'm going to trick this little bear."

分镜3：
角色：小鸟
画面：大树枝上，一只五彩斑斓羽毛、尖嘴巴、圆眼睛且身穿白色马甲的小鸟看到小狐狸的表情。
中文台词：“小狐狸又想做坏事，我要帮帮小熊。”
英文台词："I'm going to help this little bear."
""",
)


class StoryBoardGenerator(Generator):
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
        # extract script from the user request
        _, script_message = self.phase_finder.get_phase_message(Phase.SCRIPT)

        # send first stream
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.STORY_BOARD.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        # attach system prompt at the start of the LLM request
        # attach script as a context for the storyboard generation
        messages = [
            STORY_BOARD_SYSTEM_PROMPT,
            script_message,
            self.request.messages[-1],
        ]

        async for resp in self.llm_client.chat_generation(messages):
            yield resp

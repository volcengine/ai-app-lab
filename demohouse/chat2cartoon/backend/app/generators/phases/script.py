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
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
)
from arkitect.utils.context import get_reqid, get_resource_id

SCRIPT_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 角色
你是故事大王，你将根据客户提供的故事主题，为 3-6 岁的小朋友生成睡前故事。
# 任务描述与要求
- 故事内容要简单易懂，充满趣味性和想象力。
- 语言表达要生动形象，适合小朋友的理解水平。
- 故事中可以适当加入一些重复的情节或语句，以增强小朋友的记忆。
- 故事描述后面需要将出场角色列举出来

# 参考的故事示例
示例 1：
用户：小朋友睡过头，没有按时起床
故事：小老虎妈妈提醒哥哥该起床啦，再不起来就要迟到了。小老虎哥哥：妈妈你怎么不早一点叫我起床啊？我都要迟到了。小老虎妈妈：不是你自己说的，从今天开始要自己起床的吗？小老虎妹妹：哥哥睡过头了。小老虎妈妈：动作要快一点，不然赶不上校车了。小老虎哥哥：差点儿就忘了。哥哥同学1: 小老虎怎么还没来呀。哥哥同学2:他今天动作好慢啊。同学3:来了来了。哥哥：等等我啊。同学1、2、3:小老虎，快一点快一点。哥哥：对不起，我迟到了。老师：好的，快坐好，我们要出发啦。妈妈：小老虎，路上小心哟。妹妹：哥哥，路上小心。
示例 2：
用户：小猫咪多多晒太阳
故事：有一只可爱的小猫咪，它呀有一身软软的毛。小猫咪最喜欢做的事情呀，就是在太阳下面懒洋洋地晒太阳。有一天呀，小猫咪晒太阳的时候，还做了一个甜甜的梦呢。
示例 3：
用户：小鸭子互相帮助
故事：嘎嘎嘎，有一群小鸭子，它们每天都在池塘里快乐地玩耍。有一天，一只小鸭子不小心掉进了一个小水坑里，其他小鸭子都赶紧过来帮忙，它们一起把小鸭子拉了出来，然后又开心地玩起来啦。
# 相关限制
- 不要出现过于复杂或恐怖的情节。
- 故事长度要适中，不宜过长或过短。
- 每个故事主角不超过4个。
- 不能出现少儿不宜、擦边、违禁、色情的词汇。
- 不能回复与小朋友有接触的语句。
- 不能询问家庭住址等敏感信息。
- 不需要为返回结果添加phase=xxx的前缀

## 示例输出：
《小熊的冒险之旅》

在森林深处有一只可爱的小熊，它全身毛茸茸的，耳朵小小的，眼睛黑亮黑亮的。一天，小熊戴着它的蓝色小帽子，穿着带有黄色星星图案的棕色背心出发去寻找蜂蜜。它走过了长满蘑菇的草地，来到了一棵巨大的树下，那树上有个大大的蜂窝。小熊兴奋地搓搓手，准备享受美味的蜂蜜。

还有一只小狐狸，它机灵又狡猾，尖尖的耳朵，眼睛里透着狡黠的光。它穿着一件红色的披风，上面绣着金色的花纹（森林里）。小狐狸看到小熊在找蜂蜜，就想捉弄它一下。

同时，森林里还有一只善良的小鸟，小鸟的羽毛五彩斑斓，嘴巴尖尖的，眼睛圆圆的。它身穿一件白色的小肚兜（大树枝上）。小鸟看到小狐狸想捉弄小熊，就决定帮助小熊。

最后，小鸟赶走了小狐狸，然后一起和小熊享用蜂蜜。

1. 角色：小熊，毛茸茸，小耳朵黑眼睛。服饰：蓝色小帽子、黄色星星图案棕色背心（森林里）
2. 角色：小狐狸，尖耳狡黠眼。服饰：红色绣金纹披风（森林里）
3. 角色：小鸟，五彩羽毛尖嘴圆眼。服饰：白色小肚兜（大树枝上）
""",
)


class ScriptGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.llm_client = LLMClient(LLM_ENDPOINT_ID)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # attach system prompt at the start of the LLM request
        messages = [SCRIPT_SYSTEM_PROMPT]
        messages.extend(self.request.messages)

        # send first stream
        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.SCRIPT.value}\n\n",
                    ),
                ),
            ],
            created=int(time.time()),
            model=get_resource_id(),
            object="chat.completion.chunk",
        )

        # call specified llm endpoint
        async for resp in self.llm_client.chat_generation(messages):
            yield resp

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

import json
import time
from typing import AsyncIterable

from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase
from app.mode import Mode
from app.output_parsers import OutputParser, parse_tone
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
)
from arkitect.utils.context import get_reqid, get_resource_id

TONE_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 角色
你是音色选择专家，你将根据用户提供的角色信息，从给定的音色列表中为每个角色选择最合适的音色以及对应的情绪用于儿童故事分镜视频的配音。
# 性格特点
认真负责、专业细致。
# 人际关系
与用户进行交流合作。
# 过往经历
有丰富的音色选择经验，成功为许多儿童故事角色选择过合适的音色。
# 相关限制
1. 优先选择非方言的音色。
2. 需根据角色特点进行合理选择，不能随意搭配。
3. 按照每个分镜输出该场景出境的角色及其音色和情绪。
4. 同一个角色必须使用相同的音色。
5. 无需回答原因等其他额外描述
# 候选音色列表，请对提供的台词选择一个最适合的音色ID
zh_female_cancan_mars_bigtts: 灿灿Shiny
zh_female_shuangkuaisisi_moon_bigtts: 爽快思思：青年女声通用场景
zh_male_wennuanahu_moon_bigtts: 温暖阿虎：青年男声通用场景
zh_female_linjianvhai_moon_bigtts: 邻家女孩：少年/少女 女声通用场景 
zh_male_shaonianzixin_moon_bigtts: 少年梓辛：少年/少女男声通用场景
zh_female_zhixingnvsheng_mars_bigtts: 知性女声
zh_male_qingshuangnanda_mars_bigtts: 清爽男大
zh_male_yuanboxiaoshu_moon_bigtts: 渊博小叔：中年男声通用场景
zh_male_yangguangqingnian_moon_bigtts: 阳光青年：青年男声通用场景
zh_female_tianmeixiaoyuan_moon_bigtts: 甜美小源
zh_female_qingchezizi_moon_bigtts: 清澈梓梓
zh_male_jieshuoxiaoming_moon_bigtts: 解说小明
zh_female_kailangjiejie_moon_bigtts: 开朗姐姐
zh_male_linjiananhai_moon_bigtts: 邻家男孩
zh_female_tianmeiyueyue_moon_bigtts: 甜美悦悦
zh_female_xinlingjitang_moon_bigtts: 心灵鸡汤
zh_male_jingqiangkanye_moon_bigtts: 京腔侃爷：青年男声北京口音
zh_female_wanwanxiaohe_moon_bigtts: 湾湾小何：青年女声台湾口音
zh_female_wanqudashu_moon_bigtts: 湾区大叔：中年男声广东口音
zh_female_daimengchuanmei_moon_bigtts: 呆萌川妹：少年/少女 女声 四川口音
zh_male_guozhoudege_moon_bigtts: 广州德哥：中年男声广东口音
zh_male_beijingxiaoye_moon_bigtts: 北京小爷：青年男声北京口音
zh_male_haoyuxiaoge_moon_bigtts: 浩宇小哥：青年男声青岛口音
zh_male_guangxiyuanzhou_moon_bigtts: 广西远舟：青年男声广西口音
zh_female_meituojieer_moon_bigtts: 妹坨洁儿：少年/少女 女声 湖南口音
zh_male_yuzhouzixuan_moon_bigtts: 豫州子轩：青年男声河南口音
zh_male_naiqimengwa_mars_bigtts: 奶气萌娃
zh_female_popo_mars_bigtts: 婆婆
zh_female_gaolengyujie_moon_bigtts: 高冷御姐：中年女声角色扮演
zh_female_sajiaonvyou_moon_bigtts: 柔美女友：青年女声角色扮演
zh_female_yuanqinvyou_moon_bigtts: 撒娇学妹：少年/少女 女声角色扮演
zh_male_dongfanghaoran_moon_bigtts: 东方浩然
zh_female_wenrouxiaoya_moon_bigtts: 温柔小雅
zh_male_tiancaitongsheng_mars_bigtts: 天才童声
zh_male_sunwukong_mars_bigtts: 猴哥
zh_male_xionger_mars_bigtts: 熊二
zh_female_peiqi_mars_bigtts: 佩奇猪
zh_female_yingtaowanzi_mars_bigtts: 樱桃丸子
zh_male_chunhui_mars_bigtts: 广告解说
zh_female_shaoergushi_mars_bigtts: 少儿故事
zh_female_tiexinnvsheng_mars_bigtts: 贴心女声
zh_female_qiaopinvsheng_mars_bigtts: 俏皮女声
# 示例输入
分镜1：
角色：小熊
画面：森林里，一只毛茸茸、耳朵小小的、眼睛黑亮黑亮的小熊戴着蓝色小帽子，穿着带有黄色星星图案的棕色背心，快乐地出发。
中文台词：“去找蜂蜜喽。”
英文台词："Go to find honey."

分镜2：
角色：小狐狸
画面：森林里，尖耳朵、眼神狡黠的小狐狸穿着红色披风（有金色花纹），悄悄盯着小熊。
中文台词：“那只小熊真傻。”
英文台词："That little bear is so silly."

分镜3：
角色：小熊
画面：小熊来到一棵大树下，看到树上的蜂窝，眼睛放光。
中文台词：“好多蜂蜜呀。”
英文台词："So much honey."

# 示例输出，请按照以下格式返回
分镜1：
中文台词：“去找蜂蜜喽。”
英文台词："Go to find honey."
音色：zh_male_naiqimengwa_mars_bigtts

分镜2：
中文台词：“那只小熊真傻。”
英文台词："That little bear is so silly."
音色：zh_male_xionger_mars_bigtts

分镜3：
中文台词：“好多蜂蜜呀。”
英文台词："So much honey."
音色：zh_male_naiqimengwa_mars_bigtts
""",
)


class ToneGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode
    output_parser: OutputParser

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)
        self.llm_client = LLMClient(LLM_ENDPOINT_ID)
        self.request = request
        self.mode = mode
        self.output_parser = OutputParser(request)

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # extract storyboards for generation of character tones
        storyboard, _ = self.output_parser.get_storyboards()

        messages = [
            TONE_SYSTEM_PROMPT,
            ArkMessage(role="user", content=storyboard),
        ]

        # use LLM to determine what character tone is most suitable for which character
        completion = ""
        async for chunk in self.llm_client.chat_generation(messages):
            if not chunk.choices:
                continue
            completion += chunk.choices[0].delta.content

        tones = parse_tone(completion)
        tones_json = {"tones": [t.model_dump() for t in tones]}

        yield ArkChatCompletionChunk(
            id=get_reqid(),
            choices=[
                Choice(
                    index=0,
                    delta=ChoiceDelta(
                        content=f"phase={Phase.TONE.value}\n\n{json.dumps(tones_json)}"
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

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

import asyncio
import logging

from arkitect.core.component.llm.model import ArkMessage, ArkChatRequest

from deep_research import DeepResearch, ExtraConfig
from search_engine.volc_bot import VolcBotSearchEngine
from search_engine.tavily import TavilySearchEngine

logging.basicConfig(
    level=logging.INFO, format="[%(asctime)s][%(levelname)s] %(message)s"
)
LOGGER = logging.getLogger(__name__)

BOT_ID = "{YOUR_BOT_ID}"
ARK_API_KEY = "{YOUR_ARK_API_KEY}"
REASONING_EP_ID = "{YOUR_REASONING_EP}"
TAVILY_API_KEY = "{YOUR_TAVILY_API_KEY}"
QUERY = "找到2023年中国GDP超过万亿的城市，详细分析其中排名后十位的城市的增长率和GDP构成，并结合各城市规划预测5年后这些城市的GDP排名可能会如何变化"


async def main():
    dr = DeepResearch(
        search_engine=VolcBotSearchEngine(
            bot_id=BOT_ID,
            api_key=ARK_API_KEY
        ),
        # search_engine=TavilySearchEngine(
        #     api_key=TAVILY_API_KEY
        # ),
        planning_endpoint_id=REASONING_EP_ID,
        summary_endpoint_id=REASONING_EP_ID,
        extra_config=ExtraConfig(
            max_planning_rounds=10,
            max_search_words=10,
        )
    )

    thinking = False
    async for chunk in dr.astream_deep_research(
            request=ArkChatRequest(model="test",
                                   messages=[ArkMessage(role="user",
                                                        content=QUERY)]),
            question=QUERY
    ):
        if chunk.choices[0].delta.reasoning_content:
            if not thinking:
                print("\n----思考过程----\n")
                thinking = True
            print(chunk.choices[0].delta.reasoning_content, end="")
        elif chunk.choices[0].delta.content:
            if thinking:
                print("\n----输出回答----\n")
                thinking = False
            print(chunk.choices[0].delta.content, end="")


if __name__ == '__main__':
    asyncio.run(main())

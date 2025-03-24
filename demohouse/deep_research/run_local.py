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

from service import DeepResearch, ExtraConfig
from search_engine.volc_bot import VolcBotSearchEngine
from search_engine.tavily import TavilySearchEngine

logging.basicConfig(
    level=logging.INFO, format="[%(asctime)s][%(levelname)s] %(message)s"
)
LOGGER = logging.getLogger(__name__)

# recommend to use DeepSeek-R1 model
REASONING_EP_ID = "{YOUR_ENDPOINT_ID}"
# default set to volc bot, if using tavily, change it into "tavily"
SEARCH_ENGINE = "volc_bot"
# optional, if you select tavily as search engine, please configure this
TAVILY_API_KEY = "{YOUR_TAVILY_API_KEY}"
# optional, if you select volc bot as search engine, please configure this
SEARCH_BOT_ID = "{YOUR_BOT_ID}"
QUERY = "找到2023年中国GDP超过万亿的城市，详细分析其中排名后十位的城市的增长率和GDP构成，并结合各城市规划预测5年后这些城市的GDP排名可能会如何变化"


async def main():
    search_engine = VolcBotSearchEngine(bot_id=SEARCH_BOT_ID)

    if "tavily" == SEARCH_ENGINE:
        search_engine = TavilySearchEngine(api_key=TAVILY_API_KEY)

    deep_research = DeepResearch(
        search_engine=search_engine,
        planning_endpoint_id=REASONING_EP_ID,
        summary_endpoint_id=REASONING_EP_ID,
        extra_config=ExtraConfig(
            max_planning_rounds=5,  # max rounds to planning and search
            max_search_words=5,  # max search words for each planning round.
        )
    )

    thinking = False
    async for chunk in deep_research.astream_deep_research(
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

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
from abc import ABC
from typing import List, Optional

from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.bot_chat import BotChatCompletion

from .search_engine import SearchEngine, SearchResult, SearchReference

"""
using volc bot (with search plugin) to search
"""


class VolcBotSearchEngine(SearchEngine, ABC):

    def __init__(
            self,
            bot_id: str,
            api_key: Optional[str] = None,
    ):
        super().__init__()
        self._bot_id = bot_id
        self._ark_client = AsyncArk(api_key=api_key)

    def search(self, queries: List[str]) -> List[SearchResult]:
        return asyncio.run(self.asearch(queries=queries))

    async def asearch(self, queries: List[str]) -> List[SearchResult]:
        tasks = [self._single_search(query) for query in queries]
        task_results = await asyncio.gather(*tasks)
        return [
            result for result in task_results
        ]

    async def _single_search(self, query: str) -> SearchResult:
        response = await self._run_bot_search(query)
        return self._format_result(response, query)

    async def _run_bot_search(self, query: str) -> BotChatCompletion:
        return await self._ark_client.bot_chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": query,
                }
            ],
            model=self._bot_id,
            stream=False,
        )

    @classmethod
    def _format_result(cls, response: BotChatCompletion, query: str) -> SearchResult:
        return SearchResult(
            query=query,
            summary_content=response.choices[0].message.content,
            search_references=[
                SearchReference(
                    site=r.site_name,
                    url=r.url,
                    content=r.summary,
                    title=r.title,
                ) for r in response.references if response.references
            ]
        )

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

from abc import ABC
from typing import Literal, Optional, List

from tavily import TavilyClient

from .search_engine import SearchEngine, SearchResult

import asyncio


class TavilySearchEngine(SearchEngine, ABC):

    def __init__(
        self,
        api_key: str,
        search_depth: Literal["basic", "advanced"] = "basic",
        topic: Literal["general", "news"] = "general",
        days: int = 3,
        max_results: int = 5,
        include_domains: Optional[str] = None,
        exclude_domains: Optional[str] = None,
    ):
        super().__init__()
        self._tavily_client = TavilyClient(api_key=api_key)
        self._search_depth = search_depth
        self._topic = topic
        self._days = days
        self._max_results = max_results
        self._include_domains = include_domains
        self._exclude_domains = exclude_domains

    def search(self, queries: List[str]) -> List[SearchResult]:
        return asyncio.run(self.asearch(queries=queries))

    async def asearch(self, queries: List[str]) -> List[SearchResult]:
        tasks = [self._arun_search_single(query) for query in queries]
        task_results = await asyncio.gather(*tasks)
        return [r for r in task_results]

    async def _arun_search_single(self, query: str) -> SearchResult:
        return await asyncio.to_thread(self._search_single, query)

    def _search_single(self, query: str) -> SearchResult:
        response = self._tavily_client.search(
            query=query,
            search_depth=self._search_depth,
            topic=self._topic,
            days=self._days,
            max_results=self._max_results,
            include_domains=self._include_domains,
            exclude_domains=self._exclude_domains,
        )
        return SearchResult(
            query=query,
            summary_content=self._format_result(response),
        )

    @classmethod
    def _format_result(cls, tavily_result: dict) -> str:
        results = tavily_result.get("results", [])
        formatted: str = ""
        for i, result in enumerate(results):
            formatted += f"Reference{i + 1}: \n"
            formatted += f"Title: {result.get('title', '')}\n"
            formatted += f"Content: {result.get('content', '')}\n"
            formatted += "\n"
        return formatted

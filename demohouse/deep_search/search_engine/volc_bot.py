import asyncio
from abc import ABC
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.bot_chat import BotChatCompletion

from .search_engine import SearchEngine, SearchResult

"""
using volc bot (with search plugin) to search
"""


class VolcBotSearchEngine(SearchEngine, ABC):

    def __init__(
            self,
            api_key: str,
            bot_id: str,
    ):
        super().__init__()
        self._bot_id = bot_id
        self._ark_client = AsyncArk(api_key=api_key)

    def search(self, query: str) -> SearchResult:
        return asyncio.run(self.asearch(query))

    async def asearch(self, query: str) -> SearchResult:
        response = await self._run_bot_search(query)
        return SearchResult(
            raw_content=self._format_result(response)
        )

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
    def _format_result(cls, response: BotChatCompletion) -> str:
        return response.choices[0].message.content

from abc import ABC

from .search_engine import SearchEngine, SearchResult


class MockSearchEngine(SearchEngine, ABC):

    def search(self, query: str) -> SearchResult:
        return SearchResult(raw_content="今日北京有大雪")

    async def asearch(self, query: str) -> SearchResult:
        return SearchResult(raw_content="今日北京有大雪")

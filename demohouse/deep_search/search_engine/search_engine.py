from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import Optional

"""
search result definition
"""


class SearchResult(BaseModel):
    raw_content: Optional[str] = None


"""
search engine interface
"""


class SearchEngine(BaseModel, ABC):

    @abstractmethod
    def search(self, query: str) -> SearchResult:
        pass

    @abstractmethod
    async def asearch(self, query: str) -> SearchResult:
        pass

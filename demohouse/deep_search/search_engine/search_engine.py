from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import Optional

"""
搜索结果定义
"""


class SearchResult(BaseModel):
    raw_content: Optional[str] = None


"""
搜索引擎抽象
"""


class SearchEngine(BaseModel, ABC):

    @abstractmethod
    def search(self, query: str) -> SearchResult:
        pass

    @abstractmethod
    async def asearch(self, query: str) -> SearchResult:
        pass

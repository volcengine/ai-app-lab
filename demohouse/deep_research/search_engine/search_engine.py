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

from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import Optional, List

"""
single reference definition
"""


class SearchReference(BaseModel):
    site: Optional[str]
    title: Optional[str]
    url: Optional[str]
    content: Optional[str]


"""
search_result definition
"""


class SearchResult(BaseModel):
    # query is the input question
    query: str = ""
    # summary_content is a summary plain text of the query result.
    summary_content: Optional[str] = None
    # search_references is the raw references of searched result
    search_references: Optional[List[SearchReference]] = None


"""
search_engine interface
"""


class SearchEngine(BaseModel, ABC):

    @abstractmethod
    def search(self, queries: List[str]) -> List[SearchResult]:
        pass

    @abstractmethod
    async def asearch(self, queries: List[str]) -> List[SearchResult]:
        pass

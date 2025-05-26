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

from collections import OrderedDict
from typing import Generic, Optional, TypeVar

T = TypeVar("T")  # Generic type for cache values


class LRUCache(Generic[T]):
    """Generic LRU Cache implementation"""

    def __init__(self, capacity: int = 1000):
        self.capacity = capacity
        self.cache: OrderedDict[str, T] = OrderedDict()

    def get(self, key: str) -> Optional[T]:
        """
        Get value from cache and move to end if exists

        Args:
            key: Cache key to look up

        Returns:
            Cached value if found, None otherwise
        """
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key: str, value: T) -> None:
        """
        Put value in cache, evict least recently used if at capacity

        Args:
            key: Cache key
            value: Value to cache
        """
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)

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
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List

from arkitect.core.component.llm.model import ArkMessage
from arkitect.utils.common import Singleton

STATE_IDLE = 0
STATE_PENDING_FOR_RESPONSE = 1


class Context:
    def __init__(self):
        self.history = []
        self.state = STATE_IDLE
        self.expire_at = time.time() + 600


class Storage(ABC):
    @classmethod
    @abstractmethod
    async def get_history(cls, key: str) -> List[ArkMessage]:
        pass

    @classmethod
    @abstractmethod
    async def append(cls, key: str, value: ArkMessage) -> None:
        pass

    @classmethod
    @abstractmethod
    async def contains(cls, key: str) -> bool:
        pass

    @classmethod
    @abstractmethod
    async def set(cls, key: str, value: Context) -> None:
        pass


class CoroutineSafeMap(Storage, Singleton):
    _lock = asyncio.Lock()
    _map: Dict[str, Context] = {}

    def __init__(self):
        asyncio.create_task(self.cleanup())

    @classmethod
    async def get(cls, key: str, default=None) -> Context:
        async with cls._lock:
            return cls._map.get(key, default)

    @classmethod
    async def get_history(cls, key: str) -> List[ArkMessage]:
        async with cls._lock:
            ctx = cls._map.get(key)
            if ctx is None:
                return []
            return ctx.history

    @classmethod
    async def get_state(cls, key: str) -> int:
        async with cls._lock:
            ctx = cls._map.get(key)
            if ctx is None:
                return STATE_IDLE
            return ctx.state

    @classmethod
    async def set_state(cls, key: str, value: Context) -> None:
        async with cls._lock:
            if key not in cls._map:
                return
            cls._map[key].state = value

    @classmethod
    async def set(cls, key: str, value: Context) -> None:
        async with cls._lock:
            cls._map[key] = value

    @classmethod
    async def append(cls, key: str, value: ArkMessage) -> None:
        async with cls._lock:
            if key not in cls._map:
                return
            cls._map[key].history.append(value)
            cls._map[key].expire_at = time.time() + 600

    @classmethod
    async def delete(cls, key: str):
        async with cls._lock:
            if key in cls._map:
                del cls._map[key]

    @classmethod
    async def contains(cls, key: str) -> bool:
        async with cls._lock:
            return key in cls._map

    @classmethod
    async def keys(cls) -> List[str]:
        async with cls._lock:
            return list(cls._map.keys())

    @classmethod
    async def items(cls) -> List[Any]:
        async with cls._lock:
            return list(cls._map.items())

    @classmethod
    async def clear(cls) -> None:
        async with cls._lock:
            cls._map.clear()

    @classmethod
    async def cleanup(cls) -> None:
        while True:
            await asyncio.sleep(60)
            current_time = time.time()
            async with cls._lock:
                keys_to_delete = [
                    key
                    for key, entry in cls._map.items()
                    if current_time > entry.expire_at
                ]
                for key in keys_to_delete:
                    del cls._map[key]

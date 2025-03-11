# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import asyncio
import time
import warnings
from typing import Any, Generic, Optional, TypeVar

import structlog

logger = structlog.stdlib.get_logger()
T = TypeVar("T")


class Singleton(Generic[T]):
    _instance: Optional[T] = None
    _lock: asyncio.Lock = asyncio.Lock()

    @classmethod
    async def get_instance_async(cls, *args: Any, **kwargs: Any) -> T:
        if not cls._instance:
            async with cls._lock:
                if not cls._instance:
                    self = cls(*args, **kwargs)
                    assert hasattr(
                        self, "async_init"
                    ), "async singletons must define async_init function"
                    await self.async_init()
                    cls._instance = self
                    logger.debug("singleton class initialized", name=cls.__name__)
        return cls._instance

    @classmethod
    def get_instance_sync(cls, *args: Any, **kwargs: Any) -> T:
        if not cls._instance:
            self = cls(*args, **kwargs)
            assert not hasattr(
                self, "async_init"
            ), f"class {cls.__name__} init with get_instance_async."
            cls._instance = self
            logger.debug("singleton class initialized", name=cls.__name__)
        return cls._instance


class LazyLoadSingleton(Generic[T]):
    _instance: Optional[T] = None
    _lock: asyncio.Lock = asyncio.Lock()
    REFRESH_TIME_INTERVAL = 300
    _refresh_time: float = 0

    @classmethod
    def is_outdated(cls) -> bool:
        return time.time() - cls._refresh_time > cls.REFRESH_TIME_INTERVAL

    @classmethod
    async def get_instance_async(cls, *args: Any, **kwargs: Any) -> T:
        if not cls._instance or cls.is_outdated():
            async with cls._lock:
                if (not cls._instance) or cls.is_outdated():
                    assert hasattr(
                        cls, "async_init"
                    ), "async singletons must define async_init function"
                    cls._instance = await cls.async_init(*args, **kwargs)
                    cls._refresh_time = time.time()
                    logger.debug("singleton class initialized", name=cls.__name__)
        return cls._instance

    @classmethod
    def get_instance_sync(cls, *args: Any, **kwargs: Any) -> T:
        if (not cls._instance) or cls.is_outdated():
            self = cls(*args, **kwargs)
            if hasattr(self, "async_init"):
                warnings.warn(
                    f"class {cls.__name__} has async_init function, "
                    f"init it with get_instance_async."
                )
            cls._instance = self
            cls._refresh_time = time.time()
            logger.debug("singleton class initialized", name=cls.__name__)
        return cls._instance

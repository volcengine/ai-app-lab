# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import redis.asyncio as redis
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import BusyLoadingError, ConnectionError, TimeoutError

from arkitect.core.client.base import Client


class RedisClient(Client):
    """
    Initialize a new Redis client object.

    Parameters:
    host (str): The hostname of the Redis server.
    username (str): The username for the Redis server.
    password (str): The password for the Redis server.

    Returns:
    None.

    """

    def __init__(self, host: str, username: str, password: str):
        self.client = redis.Redis(
            host=host,
            username=username,
            password=password,
            retry=Retry(ExponentialBackoff(), 3),
            retry_on_error=[BusyLoadingError, ConnectionError, TimeoutError],
        )

    async def get(self, key: str) -> str:
        """
        Get the value of a key from the Redis database.

        Args:
        key (str): The key to retrieve from the Redis database.

        Returns:
        str: The value of the key, or None if the key does not exist.

        """
        return await self.client.get(key)

    async def set(self, key: str, value: str) -> None:
        """
        Set the value of a key in the Redis database.
        Args:
        key (str): The key to set in the Redis database.
        value (str): The value to set for the key.
        Returns:
        None.
        """
        await self.client.set(key, value)

    async def get_with_prefix(self, prefix: str) -> tuple[list[str], list[str]]:
        """
        Asynchronous method to obtain all keys and values from the
        Redis database that match the specified prefix

        :param prefix: The specified prefix

        :return: A list of tuples containing matching keys
            and their corresponding values
        """

        cursor = 0
        keys = []

        while True:
            # 使用 SCAN 命令进行迭代查询
            cursor, key_data = await self.client.scan(cursor, match=prefix, count=1000)

            # 将匹配到的 key 添加到列表中
            keys.extend(key_data)

            # 如果游标值为 0，则表示遍历完成
            if cursor == 0 or len(key_data) == 0:
                break

        # 使用 MGET 命令获取所有匹配到的 key 的对应 value
        values = await self.client.mget(keys)

        return keys, values

    async def mget(self, keys: list[str]) -> list[str]:
        """
        Get the values of multiple keys from the Redis database.

        Args:
        keys (list): A list of keys to retrieve from the Redis database.

        Returns:
        list: A list of values corresponding to the given keys.

        """
        return await self.client.mget(keys)

    async def delete(self, key: str) -> None:
        """
        Delete a key from the Redis database.
        Args:
        key (str): The key to delete from the Redis database.
        Returns:
        None.
        """
        await self.client.delete(key)

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

from datetime import datetime

from arkitect.core.client.redis import RedisClient
from arkitect.core.component.checkpoint.base_checkpoint_store import BaseCheckpointStore
from arkitect.core.component.checkpoint.checkpoint import Checkpoint
from arkitect.core.component.context.model import State
from arkitect.utils.common import Singleton


def make_key(app_name: str, checkpoint_id: str) -> str:
    return f"{app_name}:{checkpoint_id}"


class RedisCheckpointStore(BaseCheckpointStore):
    def __init__(self, host: str, username: str, password: str):
        # A map from app name to a map from user ID to a map from session ID to session.
        self.redis_client = RedisClient(
            host=host,
            username=username,
            password=password,
        )

    async def create_checkpoint(
        self,
        app_name: str,
        checkpoint_id: str,
        checkpoint: Checkpoint | None = None,
    ) -> Checkpoint:
        checkpoint = (
            Checkpoint(
                id=checkpoint_id,
                app_name=app_name,
                state=State(),
                last_update_time=datetime.now().timestamp(),
                create_time=datetime.now().timestamp(),
            )
            if not checkpoint
            else checkpoint
        )
        key = make_key(app_name, checkpoint_id)
        if await self.redis_client.get(key) is None:
            await self.redis_client.set(key, checkpoint.model_dump_json())
        return checkpoint

    async def get_checkpoint(self, app_name: str, checkpoint_id: str) -> Checkpoint:
        value = await self.redis_client.get(make_key(app_name, checkpoint_id))
        if value is None:
            return None
        return Checkpoint.model_validate_json(value)

    async def list_checkpoints(self, app_name: str) -> list[Checkpoint]:
        keys, values = await self.redis_client.get_with_prefix(make_key(app_name, "*"))
        return [Checkpoint.model_validate_json(value) for value in values]

    async def update_checkpoint(
        self, app_name: str, checkpoint_id: str, checkpoint: Checkpoint
    ) -> None:
        checkpoint.last_update_time = datetime.now().timestamp()
        await self.redis_client.set(
            make_key(app_name, checkpoint_id), checkpoint.model_dump_json()
        )

    async def delete_checkpoint(self, app_name: str, checkpoint_id: str) -> None:
        if await self.redis_client.get(make_key(app_name, checkpoint_id)) is not None:
            await self.redis_client.delete(make_key(app_name, checkpoint_id))


class RedisCheckpointStoreSingleton(RedisCheckpointStore, Singleton):
    pass

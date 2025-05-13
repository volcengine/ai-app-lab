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

from arkitect.core.component.checkpoint.base_checkpoint_store import BaseCheckpointStore
from arkitect.core.component.checkpoint.checkpoint import Checkpoint
from arkitect.core.component.context.model import State
from arkitect.utils.common import Singleton


class InMemoryCheckpointStore(BaseCheckpointStore):
    def __init__(self):
        # A map from app name to a map from user ID to a map from session ID to session.
        self.checkpoints: dict[str, dict[str, Checkpoint]] = {}

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
        if app_name not in self.checkpoints:
            self.checkpoints[app_name] = {}

        self.checkpoints[app_name][checkpoint_id] = checkpoint

        return checkpoint

    async def get_checkpoint(self, app_name: str, checkpoint_id: str) -> Checkpoint:
        return self.checkpoints.get(app_name, {}).get(checkpoint_id, None)

    async def list_checkpoints(self, app_name: str) -> list[Checkpoint]:
        return list(self.checkpoints.get(app_name, {}).values())

    async def update_checkpoint(
        self, app_name: str, checkpoint_id: str, checkpoint: Checkpoint
    ) -> None:
        checkpoint.last_update_time = datetime.now().timestamp()
        self.checkpoints[app_name][checkpoint_id] = checkpoint

    async def delete_checkpoint(self, app_name: str, checkpoint_id: str) -> None:
        if app_name in self.checkpoints and checkpoint_id in self.checkpoints[app_name]:
            del self.checkpoints[app_name][checkpoint_id]


class InMemoryCheckpointStoreSingleton(InMemoryCheckpointStore, Singleton):
    pass

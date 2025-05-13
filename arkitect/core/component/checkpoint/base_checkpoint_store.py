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

from abc import ABC, abstractmethod

from arkitect.core.component.checkpoint.checkpoint import Checkpoint


class BaseCheckpointStore(ABC):
    @abstractmethod
    def create_checkpoint(
        self,
        app_name: str,
        checkpoint_id: str,
        checkpoint: Checkpoint | None = None,
    ) -> Checkpoint:
        pass

    @abstractmethod
    async def get_checkpoint(self, app_name: str, checkpoint_id: str) -> Checkpoint:
        pass

    @abstractmethod
    async def list_checkpoints(self, app_name: str) -> list[Checkpoint]:
        pass

    @abstractmethod
    async def update_checkpoint(
        self, app_name: str, checkpoint_id: str, checkpoint: Checkpoint
    ) -> None:
        pass

    @abstractmethod
    async def delete_checkpoint(self, app_name: str, checkpoint_id: str) -> None:
        pass

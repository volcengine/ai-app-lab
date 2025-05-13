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

from pydantic import BaseModel, ConfigDict

from arkitect.core.component.context.model import State


class Checkpoint(BaseModel):
    """Represents a series of interactions between a user and agents.

    Attributes:
      id: The unique identifier of the checkpoint.
      app_name: The name of the app.
      state: The state of the checkpoint.
      last_update_time: The last update time of the checkpoint.
      create_time: The create time of the checkpoint.
    """

    model_config = ConfigDict(
        extra="forbid",
        arbitrary_types_allowed=True,
    )

    id: str
    """The unique identifier of the checkpoint."""
    app_name: str
    """The name of the app."""
    state: State | None = None
    """The state of the checkpoint."""
    last_update_time: float = 0.0
    """The last update time of the checkpoint."""
    create_time: float = 0.0
    """The create time of the checkpoint."""

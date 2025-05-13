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
from typing import Any

from openai.types.responses import Response
from pydantic import BaseModel
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)

from arkitect.types.llm.model import ArkMessage


class Memory(BaseModel):
    memory_content: str
    reference: Any | None = None
    metadata: Any | None = None


class SearchMemoryResponse(BaseModel):
    memories: list[Memory]

    @property
    def content(self) -> str:
        return "\n".join([m.memory_content for m in self.memories])


class BaseMemoryService(ABC):
    @abstractmethod
    async def add_or_update_memory(
        self,
        user_id: str,
        new_messages: list[ArkMessage | dict | Response | ChatCompletionMessage],
        **kwargs: Any,
    ) -> None:
        pass

    @abstractmethod
    async def search_memory(
        self,
        user_id: str,
        query: str,
        **kwargs: Any,
    ) -> SearchMemoryResponse:
        pass

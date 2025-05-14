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

import asyncio
import os
from typing import Any

from mem0 import AsyncMemory as Mem0Memory
from mem0.configs.base import MemoryConfig as Mem0Config
from mem0.embeddings.configs import EmbedderConfig
from mem0.llms.configs import LlmConfig
from mem0.vector_stores.configs import VectorStoreConfig
from openai.types.responses import Response
from pydantic import BaseModel
from typing_extensions import override
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)

from arkitect.core.component.memory.base_memory_service import (
    BaseMemoryService,
    Memory,
    SearchMemoryResponse,
)
from arkitect.core.component.memory.utils import format_message_as_dict
from arkitect.telemetry.logger import ERROR, INFO
from arkitect.types.llm.model import ArkMessage
from arkitect.utils.common import Singleton

DEFAULT_EMBEDDING_MODEL = "doubao-embedding-text-240715"
DEFAULT_LLM_MODEL = "doubao-1-5-vision-pro-32k-250115"
DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


default_ark_config = Mem0Config(
    embedder=EmbedderConfig(
        provider="openai",
        config={
            "model": DEFAULT_EMBEDDING_MODEL,
            "openai_base_url": DEFAULT_BASE_URL,
            "api_key": os.getenv("ARK_API_KEY"),
            "embedding_dims": 2560,
        },
    ),
    llm=LlmConfig(
        provider="openai",
        config={
            "model": DEFAULT_LLM_MODEL,
            "openai_base_url": DEFAULT_BASE_URL,
            "api_key": os.getenv("ARK_API_KEY"),
        },
    ),
    vector_store=VectorStoreConfig(config={"embedding_model_dims": 2560}),
)


class Mem0MemoryService(BaseMemoryService):

    def __init__(self, config: Mem0Config = default_ark_config) -> None:
        self.mem0_config = config if config else Mem0Config()
        self._llm = AsyncArk()
        self.memory = Mem0Memory(config=self.mem0_config)
        self._task_queue: asyncio.Queue = asyncio.Queue()

    @override
    async def update_memory(
        self,
        user_id: str,
        new_messages: list[ArkMessage | dict | Response | ChatCompletionMessage],
        blocking: bool = False,
        **kwargs: Any,
    ) -> None:
        conversation = []
        for item in new_messages:
            conversation.append(format_message_as_dict(item))
        if blocking:
            await self._add_memory(conversation, user_id)
        else:
            await self._task_queue.put(
                asyncio.create_task(self._add_memory(conversation, user_id))
            )
            INFO("Memory update submitted")

    async def _add_memory(self, conversation, user_id):
        await self.memory.add(conversation, user_id=user_id)
        INFO("Memory update completed")

    async def _background_processor(self) -> None:
        while True:
            task = await self._task_queue.get()
            try:
                await task
            except Exception as e:
                ERROR(f"Memory update failed: {e}")
            self._task_queue.task_done()

    @override
    async def search_memory(
        self,
        user_id: str,
        query: str,
        **kwargs: Any,
    ) -> SearchMemoryResponse:
        relevant_memories = await self.memory.search(
            query=query, user_id=user_id, limit=3
        )
        fetched_results = relevant_memories.get("results", [])
        memeory_string = ""
        for element in fetched_results:
            memeory_string += element.get("memory", "") + "\n"
        return SearchMemoryResponse(
            memories=[
                Memory(
                    memory_content=memeory_string,
                    reference=None,
                    metadata=relevant_memories,
                )
            ]
        )

    async def delete_user(self, user_id: str) -> None:
        await self.memory.delete_all(user_id=user_id)


class Mem0MemoryServiceSingleton(Mem0MemoryService, Singleton):
    pass

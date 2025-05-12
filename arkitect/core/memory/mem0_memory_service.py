import json
from typing import Any

from mem0 import AsyncMemory as Mem0Memory
from mem0.configs.base import MemoryConfig
from mem0.embeddings.configs import EmbedderConfig
from mem0.llms.configs import LlmConfig
from mem0.vector_stores.configs import VectorStoreConfig
from openai import OpenAI
from openai.types.responses import Response
from typing_extensions import override
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)

from arkitect.core.memory.base_memory_service import (
    BaseMemoryService,
    Memory,
    SearchMemoryResponse,
)
from arkitect.core.memory.utils import get_response_str, get_user_input_str
from arkitect.types.llm.model import ArkMessage

DEFAULT_SEARCH_MEM_PROMPT = """
你获得了一系列用户与AI助手的互动记录。
请从过去的互动中找出用户的画像以及其他关键信息，以帮助回答用户的新问题。
"""


class Mem0MemoryService(BaseMemoryService):
    def __init__(self) -> None:
        base_url = "https://ark.cn-beijing.volces.com/api/v3"
        api_key = "13b37be9-ec98-4af1-88cb-4436664e1af7"
        llm_model = "doubao-1-5-vision-pro-32k-250115"
        embedding_model = "doubao-embedding-text-240715"

        self._llm = AsyncArk()

        self.memory = Mem0Memory(
            config=MemoryConfig(
                embedder=EmbedderConfig(
                    provider="openai",
                    config={
                        "model": embedding_model,
                        "openai_base_url": base_url,
                        "api_key": api_key,
                        "embedding_dims": 2560,
                    },
                ),
                llm=LlmConfig(
                    provider="openai",
                    config={
                        "model": llm_model,
                        "openai_base_url": base_url,
                        "api_key": api_key,
                    },
                ),
                vector_store=VectorStoreConfig(config={"embedding_model_dims": 2560}),
            )
        )

    @override
    async def add_or_update_memory(
        self,
        user_id: str,
        user_input: list[ArkMessage | dict],
        assistant_response: Response | list[ChatCompletionMessage],
        **kwargs: Any,
    ) -> None:

        conversation = [
            {
                "role": "user",
                "content": get_user_input_str(user_input),
            },
            {
                "role": "assistant",
                "content": get_response_str(assistant_response),
            },
        ]
        await self.memory.add(conversation, user_id=user_id)

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
        memory_content = json.dumps(relevant_memories)
        return SearchMemoryResponse(
            memories=[
                Memory(
                    memory_content=memory_content,
                    reference=None,
                )
            ]
        )

    @override
    async def delete_user(self, user_id: str) -> None:
        await self.memory.delete_all(user_id=user_id)

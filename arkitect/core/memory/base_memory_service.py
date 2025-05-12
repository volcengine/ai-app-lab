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
    reference: Any | None


class SearchMemoryResponse(BaseModel):
    memories: list[Memory]


class BaseMemoryService(ABC):
    @abstractmethod
    async def add_or_update_memory(
        self,
        user_id: str,
        user_input: list[ArkMessage | dict],
        assistant_response: Response | list[ChatCompletionMessage],
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

    @abstractmethod
    async def delete_user(self, user_id: str) -> None:
        pass

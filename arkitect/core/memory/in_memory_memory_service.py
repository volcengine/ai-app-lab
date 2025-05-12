from typing import Any

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


class InMemoryMemoryService(BaseMemoryService):
    def __init__(self) -> None:
        self.memory: dict = {}
        self._cached_query: dict = {}
        self._llm = AsyncArk()

    @override
    async def add_or_update_memory(
        self,
        user_id: str,
        user_input: list[ArkMessage | dict],
        assistant_response: Response | list[ChatCompletionMessage],
        **kwargs: Any,
    ) -> None:
        if user_id not in self.memory:
            self.memory[user_id] = []
        self.memory[user_id].append((user_input, assistant_response))

        # invalidate cache
        self._cached_query[user_id] = {}

    @override
    async def search_memory(
        self,
        user_id: str,
        query: str,
        **kwargs: Any,
    ) -> SearchMemoryResponse:
        if user_id not in self.memory:
            return SearchMemoryResponse(
                memories=[
                    Memory(
                        memory_content="no memory found for this user",
                        reference=None,
                    )
                ]
            )
        if self._cached_query.get(user_id, {}).get(query, None) is not None:
            return self._cached_query[user_id][query]
        memories = self.memory[user_id]
        results = "用户过去的交互记录\n\n"
        for memory in memories:
            user_input, assistant_response = memory
            qna = f"""
                Q: {get_user_input_str(user_input)}
                A: {get_response_str(assistant_response)}\n
            """
            results += qna
        summary = await self._llm.chat.completions.create(
            model="doubao-1-5-pro-32k-250115",
            messages=[
                {
                    "role": "system",
                    "content": DEFAULT_SEARCH_MEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": results,
                },
            ],
            stream=False,
        )
        memory_response = SearchMemoryResponse(
            memories=[
                Memory(
                    memory_content=summary.choices[0].message.content,
                    reference=None,
                )
            ]
        )
        if user_id not in self._cached_query:
            self._cached_query[user_id] = {}
        self._cached_query[user_id][query] = memory_response
        return memory_response

    @override
    async def delete_user(self, user_id: str) -> None:
        if user_id in self.memory:
            del self.memory[user_id]

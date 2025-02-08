from typing import AsyncIterator, Optional
from jinja2 import Template

from arkitect.core.component.llm.model import ArkChatRequest, ArkChatParameters, ArkChatResponse, ArkChatCompletionChunk
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.prompts import CustomPromptTemplate
from arkitect.telemetry.logger import INFO
from arkitect.telemetry.trace import task
from pydantic import BaseModel, Field
from prompt import DEFAULT_SUMMARY_PROMPT
from search_engine import SearchEngine
from search_engine.mock import MockSearchEngine
from utils import get_current_date

"""
search summary component

will run search firstly and then run the reasoning llm to summary
"""


class DeepSearch(BaseModel):
    search_engine: SearchEngine = Field(default_factory=MockSearchEngine)
    endpoint_id: str = Field(default_factory="")
    template: Template = DEFAULT_SUMMARY_PROMPT

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    """
    search once, non-stream output
    """

    @task()
    async def search_and_summary(
            self,
            request: ArkChatRequest,
            query: str,
    ) -> ArkChatResponse:

        INFO(f"start searching with query: {query}")

        # 1. search with specified engine.
        search_result = await self.search_engine.asearch(query)

        INFO(f"got search result: {search_result}")

        # 2. run llm to summary
        llm = await self._get_llm(request)

        return await llm.arun(
            reference=search_result.raw_content,  # pass the search result to prompt template
            question=query,
            meta_info=f"当前时间：{get_current_date()}",
        )

    """
    search once, stream output
    """

    @task()
    async def stream_search_and_summary(
            self,
            request: ArkChatRequest,
            query: Optional[str],
    ) -> AsyncIterator[ArkChatCompletionChunk]:

        INFO(f"start searching with query: {query}")

        # 1. search with specified engine.
        search_result = await self.search_engine.asearch(query)

        INFO(f"got search result: {search_result}")

        llm = await self._get_llm(request)

        # 2. run llm to summary
        rsp_stream = llm.astream(
            reference=search_result.raw_content,  # pass the search result to prompt template
            question=query,
            meta_info=f"当前时间：{get_current_date()}"
        )

        async for chunk in rsp_stream:
            yield chunk

    async def _get_llm(self, request: ArkChatRequest) -> BaseChatLanguageModel:
        tpl = CustomPromptTemplate(
            template=self.template,
            messages=request.messages,
            keep_history_systems=True,  # system prompt message
            keep_history_questions=False,  # user message
            keep_history_answers=False,  # ai message
            chat_history_keep_human=True,  # chat history string gather user message
            chat_history_keep_ai=True,  # chat history string gather ai message
            chat_history_len_limit=1000,  # chat history len limit
        )

        return BaseChatLanguageModel(
            endpoint_id=self.endpoint_id,
            template=tpl,
            messages=request.messages,
            parameters=ArkChatParameters(**request.__dict__),
        )

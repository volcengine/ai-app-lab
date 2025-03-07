# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Dict, List, AsyncIterable

from jinja2 import Template
from pydantic import BaseModel, Field
from typing_extensions import Optional

import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import ArkMessage, ArkChatRequest, ArkChatResponse, ArkChatCompletionChunk
from arkitect.core.component.prompts import CustomPromptTemplate
from arkitect.telemetry.logger import INFO

from search_engine import SearchEngine, SearchResult
from search_engine.volc_bot import VolcBotSearchEngine
from prompt import DEFAULT_PLANNING_PROMPT, DEFAULT_SUMMARY_PROMPT
from utils import get_current_date, cast_content_to_reasoning_content, gen_metadata_chunk

"""
ResultsSummary is using to store the result searched so far
"""


class ResultsSummary(BaseModel):
    """
    key: query
    values: list of searched references for this query
    """
    ref_dict: Dict[str, List[SearchResult]] = Field(default_factory=dict)

    def add_result(self, query: str, results: List[SearchResult]) -> None:
        if query not in self.ref_dict:
            self.ref_dict[query] = results.copy()
        else:
            extended_references = self.ref_dict.get(query, [])
            extended_references.extend(results)
            self.ref_dict[query] = extended_references

    def to_plaintext(self) -> str:
        output = ""

        for key, value in self.ref_dict.items():
            output += f"\n【查询 “{key}” 得到的相关资料】"
            output += "\n".join([v.summary_content for v in value])

        return output


class ExtraConfig(BaseModel):
    # max_planning_rounds
    max_planning_rounds: int = 5
    # max_search_words
    max_search_words: int = 5
    # planning_template (prompt)
    planning_template: Template = DEFAULT_PLANNING_PROMPT
    # summary_template (prompt)
    summary_template: Template = DEFAULT_SUMMARY_PROMPT

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True


"""
DeepResearch 
"""


class DeepResearch(BaseModel):
    search_engine: SearchEngine = Field(default_factory=VolcBotSearchEngine)
    planning_endpoint_id: str = Field(default_factory="")
    summary_endpoint_id: str = Field(default_factory="")
    extra_config: ExtraConfig = Field(default_factory=ExtraConfig)

    async def arun_deep_research(self, request: ArkChatRequest, question: str) -> ArkChatResponse:
        references = ResultsSummary()
        buffered_reasoning_content = ""

        # 1. run reasoning
        reasoning_stream = self.astream_planning(
            request=request,
            question=question,
            references=references,
        )

        async for reasoning_chunk in reasoning_stream:
            buffered_reasoning_content += reasoning_chunk.choices[0].delta.reasoning_content

        # 2. run summary
        # append the reasoning content as an assistant message to help summary
        request.messages.append(
            ArkMessage(
                role="assistant",
                content=buffered_reasoning_content,
            )
        )
        resp = await self.arun_summary(
            request=request,
            question=question,
            references=references
        )
        # append the reasoning buffer
        resp.choices[0].message.reasoning_content = (
                buffered_reasoning_content + resp.choices[0].message.reasoning_content)
        return resp

    async def astream_deep_research(self, request: ArkChatRequest, question: str) \
            -> AsyncIterable[ArkChatCompletionChunk]:
        references = ResultsSummary()
        buffered_reasoning_content = ""

        # 1. stream reasoning
        reasoning_stream = self.astream_planning(
            request=request,
            question=question,
            references=references,
        )

        async for reasoning_chunk in reasoning_stream:
            buffered_reasoning_content += reasoning_chunk.choices[0].delta.reasoning_content
            yield reasoning_chunk

        # 2. stream summary
        # append the reasoning content as an assistant message to help summary
        request.messages.append(
            ArkMessage(
                role="assistant",
                content=buffered_reasoning_content,
            )
        )
        summary_stream = self.astream_summary(
            request=request,
            question=question,
            references=references,
        )

        async for summary_chunk in summary_stream:
            yield summary_chunk

    async def astream_planning(
            self,
            request: ArkChatRequest,
            question: str,
            references: ResultsSummary
    ) -> AsyncIterable[ArkChatCompletionChunk]:

        planned_rounds = 1
        while planned_rounds <= self.extra_config.max_planning_rounds:
            planned_rounds += 1

            llm = BaseChatLanguageModel(
                endpoint_id=self.planning_endpoint_id,
                template=CustomPromptTemplate(template=self.extra_config.planning_template or DEFAULT_PLANNING_PROMPT),
                messages=request.messages,
            )

            stream = llm.astream(
                reference=references.to_plaintext(),  # pass the search result to prompt template
                question=question,
                max_search_words=self.extra_config.max_search_words,
                meta_info=f"当前时间：{get_current_date()}"
            )

            planning_result = ""

            async for chunk in stream:
                if chunk.choices[0].delta.reasoning_content:
                    yield chunk
                elif chunk.choices[0].delta.content:
                    planning_result += chunk.choices[0].delta.content
                    # cast the content into reasoning content
                    yield cast_content_to_reasoning_content(chunk)

            INFO(f"got planning_result: {planning_result}")

            new_queries = self.check_query(planning_result)
            if not new_queries:
                # YIELD state with metadata
                yield gen_metadata_chunk(
                    metadata={
                        'search_state': 'finished'
                    }
                )
                INFO("planning finished")
                break
            else:
                INFO(f"searching: {new_queries}")
                # YIELD state with metadata
                yield gen_metadata_chunk(
                    metadata={
                        'search_rounds': planned_rounds,
                        'search_state': 'searching',
                        'search_keywords': new_queries
                    }
                )
                search_results = await self.search_engine.asearch(new_queries)
                INFO(f"search result: {search_results}")
                # YIELD state with metadata
                yield gen_metadata_chunk(
                    metadata={
                        'search_rounds': planned_rounds,
                        'search_state': 'searched',
                        'search_keywords': new_queries,
                        'search_results': search_results
                    }
                )
                for search_result in search_results:
                    references.add_result(query=search_result.query, results=[search_result])

    async def arun_summary(self, request: ArkChatRequest, question: str, references: ResultsSummary) -> ArkChatResponse:
        llm = BaseChatLanguageModel(
            endpoint_id=self.summary_endpoint_id,
            template=CustomPromptTemplate(template=self.extra_config.summary_template),
            messages=request.messages,
        )

        return await llm.arun(
            reference=references.to_plaintext(),
            question=question,
            meta_info=f"当前时间：{get_current_date()}"
        )

    async def astream_summary(self, request: ArkChatRequest, question: str, references: ResultsSummary) \
            -> AsyncIterable[ArkChatCompletionChunk]:
        llm = BaseChatLanguageModel(
            endpoint_id=self.summary_endpoint_id,
            template=CustomPromptTemplate(template=self.extra_config.summary_template or DEFAULT_SUMMARY_PROMPT),
            messages=request.messages,
        )

        INFO("----- 联网资料 -----")
        INFO(f"{references.to_plaintext()}")

        stream = llm.astream(
            reference=references.to_plaintext(),
            question=question,
            meta_info=f"当前时间：{get_current_date()}"
        )

        async for chunk in stream:
            yield chunk

    @classmethod
    def check_query(cls, output: str) -> Optional[List[str]]:
        if '无需' in output:
            return None
        return [o.strip() for o in output.split(';')]

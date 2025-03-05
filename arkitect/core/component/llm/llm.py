# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Any, Dict, List, Optional, Union

from langchain.prompts.chat import BaseChatPromptTemplate
from langchain.schema.output_parser import BaseTransformOutputParser
from mcp.server.fastmcp import FastMCP
from volcenginesdkarkruntime import Ark, AsyncArk
from volcenginesdkarkruntime._streaming import AsyncStream
from volcenginesdkarkruntime.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
)

from arkitect.core.component.mcp.mcp_client import MCPClient
from arkitect.core.component.tool import BaseTool
from arkitect.telemetry.trace import task
from arkitect.utils.context import get_extra_headers

from .base import BaseLanguageModel
from .function_call import handle_function_call
from .model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
    FunctionCallMode,
)
from .utils import format_ark_prompts


class BaseChatLanguageModel(BaseLanguageModel):
    messages: List[ArkMessage]
    parameters: Optional[ArkChatParameters] = None
    template: Optional[BaseChatPromptTemplate] = None
    output_parser: Optional[BaseTransformOutputParser] = None

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    def generate_prompts(
        self,
        messages: List[ArkMessage],
        *,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> List[ArkMessage]:
        # additional system prompts would be put at first
        if additional_system_prompts:
            prompts = [
                ArkMessage(role="system", content=system_prompt)
                for system_prompt in additional_system_prompts
            ]
            prompts.extend(messages)
            messages = prompts

        if not self.template:
            return messages

        return format_ark_prompts(self.template, messages, **kwargs)

    def get_request_model(self, **kwargs: Any) -> str:
        return self.endpoint_id

    @task()
    def parse_output(self, text: str) -> Any:
        if not self.output_parser:
            return text

        return self.output_parser.parse(text)

    @task()
    async def aparse_output(self, text: str) -> Any:
        if not self.output_parser:
            return text

        return await self.output_parser.aparse(text)

    @task()
    async def _arun(
        self,
        request: ArkChatRequest,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> Union[ChatCompletion, AsyncStream[ChatCompletionChunk]]:
        assert isinstance(self.client, AsyncArk), TypeError("Invalid Client for v3 sdk")

        params = request.get_chat_request(extra_body)

        extra_headers = get_extra_headers(extra_headers)

        return await self.client.chat.completions.create(
            **params,
            extra_headers=extra_headers,
            extra_query=extra_query,
        )

    @task()
    def _run(
        self,
        request: ArkChatRequest,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> Union[ChatCompletion, AsyncStream[ChatCompletionChunk]]:
        sync_client = Ark()

        extra_headers = get_extra_headers(extra_headers)

        return sync_client.chat.completions.create(
            **request.get_chat_request(extra_body),
            extra_headers=extra_headers,
            extra_query=extra_query,
        )

    def run(
        self,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Runs a chat request and returns the response.
        """
        parameters = (
            self.parameters.model_dump(exclude_none=True, exclude_unset=True)
            if self.parameters
            else {}
        )
        request = ArkChatRequest(
            stream=False,
            messages=self.generate_prompts(self.messages, **kwargs),
            model=self.get_request_model(**kwargs),
            **parameters,
        )

        completion = self._run(request, extra_headers, extra_query, extra_body)
        return ArkChatResponse(**completion.__dict__)

    def stream(
        self,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Streams chat completions from the language model.
        """
        parameters = (
            self.parameters.model_dump(exclude_none=True, exclude_unset=True)
            if self.parameters
            else {}
        )
        request = ArkChatRequest(
            stream=True,
            messages=self.generate_prompts(self.messages, **kwargs),
            model=self.get_request_model(**kwargs),
            **parameters,
        )

        completion = self._run(request, extra_headers, extra_query, extra_body)
        for resp in completion:
            yield ArkChatCompletionChunk(**resp.__dict__)

    async def arun(
        self,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        *,
        functions: list[MCPClient | callable] | None = None,
        function_call_mode: Optional[FunctionCallMode] = FunctionCallMode.SEQUENTIAL,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> ArkChatResponse:
        """
        Asynchronously runs a chat request and returns the response.
        """
        parameters: Dict[str, Any] = (
            self.parameters.model_dump(exclude_none=True, exclude_unset=True)
            if self.parameters
            else {}
        )

        if functions:
            parameters["tools"] = [
                function.tool_schema() for function in functions.values() or []
            ]

        request = ArkChatRequest(
            stream=False,
            messages=self.generate_prompts(
                self.messages,
                additional_system_prompts=additional_system_prompts,
                **kwargs,
            ),
            model=self.get_request_model(**kwargs),
            **parameters,
        )
        responses = []
        while True:
            completion: ChatCompletion = await self._arun(
                request, extra_headers, extra_query, extra_body
            )
            responses.append(completion)

            if completion.choices and completion.choices[0].finish_reason:
                if not await handle_function_call(
                    request, completion, functions, function_call_mode
                ):
                    break

        return ArkChatResponse.merge(responses)

    async def astream(
        self,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        *,
        functions: list[MCPClient | callable] | None = None,
        function_call_mode: Optional[FunctionCallMode] = FunctionCallMode.SEQUENTIAL,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> AsyncStream[ArkChatCompletionChunk]:
        """
        Asynchronously streams chat completions from the language model.
        """

        parameters: Dict[str, Any] = (
            self.parameters.model_dump(exclude_none=True, exclude_unset=True)
            if self.parameters
            else {}
        )

        if functions:
            parameters["tools"] = [
                function.tool_schema() for function in functions.values() or []
            ]

        request = ArkChatRequest(
            stream=True,
            messages=self.generate_prompts(
                self.messages,
                additional_system_prompts=additional_system_prompts,
                **kwargs,
            ),
            model=self.get_request_model(**kwargs),
            **parameters,
        )

        usage_chunks = []
        while True:
            completion = await self._arun(
                request, extra_headers, extra_query, extra_body
            )
            # default: one iter
            is_more_request = False
            final_tool_calls = {}
            cumulated = []
            async for resp in completion:  # type: ChatCompletionChunk
                if resp.usage:
                    usage_chunks.append(resp)
                    continue
                if not resp.choices:
                    continue
                # cumulated chunks is used for caculator/fc inner cot output
                cumulated.append(resp)
                if resp.choices[0].delta.tool_calls:
                    for tool_call in resp.choices[0].delta.tool_calls:
                        index = tool_call.index
                        if index not in final_tool_calls:
                            final_tool_calls[index] = tool_call
                        else:
                            final_tool_calls[
                                index
                            ].function.arguments += tool_call.function.arguments
                else:
                    # hide tool_calls info from response
                    if resp.choices[0].finish_reason != "tool_calls":
                        yield ArkChatCompletionChunk(**resp.__dict__)
                if resp.choices[0].finish_reason == "tool_calls":
                    ark_resp = ArkChatCompletionChunk.merge(cumulated)
                    ark_resp.choices[0].delta.tool_calls = list(  # type: ignore
                        final_tool_calls.values()
                    )
                    is_more_request = await handle_function_call(
                        request, ark_resp, functions, function_call_mode
                    )

            if not is_more_request:
                break

        if len(usage_chunks) > 0:
            yield ArkChatCompletionChunk.merge(usage_chunks)

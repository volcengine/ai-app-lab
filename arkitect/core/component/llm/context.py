from typing import Any, Awaitable, Callable, Dict, List, Optional, Union

from pydantic import BaseModel, Field
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime._streaming import AsyncStream
from volcenginesdkarkruntime.types.context.context_chat_completion import (
    ContextChatCompletion,
)
from volcenginesdkarkruntime.types.context.context_chat_completion_chunk import (
    ContextChatCompletionChunk,
)
from volcenginesdkarkruntime.types.context.create_context_response import (
    CreateContextResponse,
)

from arkitect.core.client import default_ark_client
from arkitect.core.component.llm.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    ArkContextParameters,
    ArkMessage,
    FunctionCallMode,
)
from arkitect.core.component.tool.pool import ToolManifest
from arkitect.telemetry.trace import task
from arkitect.utils.context import get_extra_headers

PreRequestHook = Callable[
    [List[ArkMessage], List[ArkMessage]], Awaitable[List[ArkMessage]]
]


async def _message_append_pre_request_hook(
    history_messages: List[ArkMessage], new_messages: List[ArkMessage]
) -> List[ArkMessage]:
    history_messages.extend(new_messages)
    return history_messages


async def _session_cache_pre_request_hook(
    history_messages: List[ArkMessage], new_messages: List[ArkMessage]
) -> List[ArkMessage]:
    return new_messages


class BaseContextChatLanguageModel(BaseChatLanguageModel):
    context_id: str = Field(default="")

    @task()
    async def _arun(
        self,
        request: ArkChatRequest,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> Union[ContextChatCompletion, AsyncStream[ContextChatCompletionChunk]]:
        assert isinstance(self.client, AsyncArk), TypeError("Invalid Client for v3 sdk")

        params = request.get_chat_request(extra_body)
        params["context_id"] = self.context_id
        extra_headers = get_extra_headers(extra_headers)
        return await self.client.context.completions.create(
            **params,
            extra_headers=extra_headers,
            extra_query=extra_query,
        )

    @task()
    async def arun(
        self,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        *,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> ArkChatResponse:
        """
        Asynchronously runs a context chat request and returns the response.
        """
        parameters: Dict[str, Any] = (
            self.parameters.model_dump(exclude_none=True, exclude_unset=True)
            if self.parameters
            else {}
        )
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
        completion: ContextChatCompletion = await self._arun(
            request, extra_headers, extra_query, extra_body
        )
        return ArkChatResponse.merge([completion])

    async def astream(
        self,
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        *,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> AsyncStream[ArkChatCompletionChunk]:
        """
        Asynchronously streams context chat completions from the language model.
        """
        parameters: Dict[str, Any] = (
            self.parameters.model_dump(exclude_none=True, exclude_unset=True)
            if self.parameters
            else {}
        )
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
        completion = await self._arun(request, extra_headers, extra_query, extra_body)
        async for resp in completion:  # type: ContextChatCompletionChunk
            if resp.usage:
                usage_chunks.append(resp)
                continue
            if not resp.choices:
                continue
            yield ArkChatCompletionChunk(**resp.__dict__)

        if len(usage_chunks) > 0:
            yield ArkChatCompletionChunk.merge(usage_chunks)


class Context(BaseModel):
    model: str
    context_id: Optional[str] = Field(default=None)
    client: AsyncArk = Field(default_factory=default_ark_client)
    messages: List[ArkMessage] = Field(default_factory=list)
    parameters: Optional[ArkChatParameters] = Field(default=None)
    context_parameters: Optional[ArkContextParameters] = Field(default=None)
    pre_request_hook: List[PreRequestHook] = Field(default_factory=list)

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def __aenter__(self) -> "Context":
        if self.context_parameters is not None:
            resp: CreateContextResponse = await self.client.context.create(
                model=self.model,
                mode=self.context_parameters.mode,
                messages=self.context_parameters.messages,
                ttl=self.context_parameters.ttl,
                truncation_strategy=self.context_parameters.truncation_strategy,
            )
            self.context_id = resp.id
            if self.context_parameters.mode == "session":
                self.pre_request_hook.append(_session_cache_pre_request_hook)
            else:
                self.pre_request_hook.append(_message_append_pre_request_hook)
        else:
            self.context_id = None
            self.pre_request_hook.append(_message_append_pre_request_hook)
        return self

    async def __aexit__(
        self,
        exc_type: Optional[type[BaseException]],
        exc_value: Optional[BaseException],
        exc_tb: object,
    ) -> None:
        self.messages = []

    async def pre_request_process(
        self, messages: List[ArkMessage]
    ) -> Union[BaseChatLanguageModel, BaseContextChatLanguageModel]:
        for hook in self.pre_request_hook:
            self.messages = await hook(self.messages, messages)
        if self.context_id:
            return BaseContextChatLanguageModel(
                endpoint_id=self.model,
                messages=self.messages,
                parameters=self.parameters,
                context_id=self.context_id,
            )
        else:
            return BaseChatLanguageModel(
                endpoint_id=self.model,
                messages=self.messages,
                parameters=self.parameters,
            )

    async def arun(
        self,
        messages: List[ArkMessage],
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        *,
        functions: Optional[Dict[str, ToolManifest]] = None,
        function_call_mode: Optional[FunctionCallMode] = FunctionCallMode.SEQUENTIAL,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> ArkChatResponse:
        model = await self.pre_request_process(messages)
        resp = await model.arun(
            extra_headers,
            extra_query,
            extra_body,
            functions=functions,
            function_call_mode=function_call_mode,
            additional_system_prompts=additional_system_prompts,
            **kwargs,
        )
        if resp.choices and resp.choices[0].message.content:
            self.messages.append(
                ArkMessage(role="assistant", content=resp.choices[0].message.content)
            )
        return resp

    async def astream(
        self,
        messages: List[ArkMessage],
        extra_headers: Optional[Dict[str, str]] = {},
        extra_query: Optional[Dict[str, Any]] = None,
        extra_body: Optional[Dict[str, Any]] = None,
        *,
        functions: Optional[Dict[str, ToolManifest]] = None,
        function_call_mode: Optional[FunctionCallMode] = FunctionCallMode.SEQUENTIAL,
        additional_system_prompts: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> AsyncStream[ArkChatCompletionChunk]:
        model = await self.pre_request_process(messages)
        message = ""
        async for chunk in model.astream(
            extra_headers,
            extra_query,
            extra_body,
            functions=functions,
            function_call_mode=function_call_mode,
            additional_system_prompts=additional_system_prompts,
            **kwargs,
        ):
            if chunk.choices and chunk.choices[0].delta.content:
                message += chunk.choices[0].delta.content
            yield chunk
        self.messages.append(ArkMessage(role="assistant", content=message))

from typing import Any, Awaitable, Callable, Dict, List, Optional

from pydantic import BaseModel, Field
from volcenginesdkarkruntime._streaming import AsyncStream

from arkitect.core.component.llm.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatResponse,
    ArkMessage,
    FunctionCallMode,
)
from arkitect.core.component.tool.pool import ToolManifest

PreRequestHook = Callable[[List[ArkMessage]], Awaitable[List[ArkMessage]]]


class Context(BaseModel):
    endpoint_id: str
    messages: List[ArkMessage] = Field(default_factory=list)
    parameters: Optional[ArkChatParameters] = Field(default=None)
    preRequestHook: List[PreRequestHook] = Field(default_factory=list)

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def __aenter__(self) -> "Context":
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
    ) -> BaseChatLanguageModel:
        self.messages.extend(messages)
        for hook in self.preRequestHook:
            self.messages = await hook(self.messages)
        model = BaseChatLanguageModel(
            endpoint_id=self.endpoint_id,
            messages=self.messages,
            parameters=self.parameters,
        )
        return model

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

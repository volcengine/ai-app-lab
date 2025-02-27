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

"protocol for ark"

from __future__ import annotations

from enum import Enum
from typing import (
    Any,
    Coroutine,
    Dict,
    List,
    Optional,
    Protocol,
    Union,
)

import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk
from pydantic import BaseModel, Field, field_validator, model_validator
from typing_extensions import Annotated, Literal
from volcenginesdkarkruntime.types.chat.chat_completion import ChatCompletion, Choice
from volcenginesdkarkruntime.types.chat.chat_completion_message_param import (
    ChatCompletionMessageParam,
)
from volcenginesdkarkruntime.types.chat.chat_completion_stream_options_param import (
    ChatCompletionStreamOptionsParam,
)
from volcenginesdkarkruntime.types.completion_usage import CompletionUsage
from volcenginesdkarkruntime.types.context.context_chat_completion import (
    ContextChatCompletion,
)
from volcenginesdkarkruntime.types.context.context_chat_completion_chunk import (
    ContextChatCompletionChunk,
)
from volcenginesdkarkruntime.types.context.context_create_params import (
    TruncationStrategy,
    TTLTypes,
)

from arkitect.core.errors import InvalidParameter, MissingParameter
from arkitect.core.runtime import Request, Response


class UserInfoExtra(BaseModel):
    city: str = ""
    district: str = ""


class CallableFunction(Protocol):
    def __call__(
        self,
        request: Dict[str, Any],
        **kwargs: Any,
    ) -> Coroutine[
        Any,
        Any,
        Union[Union[str, BaseModel], Union[str, BaseModel]],
    ]:
        ...


class FunctionCallMode(str, Enum):
    SEQUENTIAL = "sequential"
    """
    The function will be called sequentially, one after the other.
    """
    PARALLEL = "parallel"
    """
    The function will be called in parallel, and the results will be combined at the
    end.
    """
    ONCE = "ONCE"
    """
    The function will be called once and returns the result.
    """


class FunctionDefinition(BaseModel):
    name: str
    """The name of the function to be called.

    Must be a-z, A-Z, 0-9, or contain underscores and dashes, with a maximum length
    of 64.
    """

    description: str
    """
    A description of what the function does, used by the model to choose when and
    how to call the function.
    """

    parameters: Dict[str, Any]
    """The parameters the functions accepts, described as a JSON Schema object.

    See the
    [JSON Schema reference](https://json-schema.org/understanding-json-schema/) for
    documentation about the format.

    Omitting `parameters` defines a function with an empty parameter list.
    """


class ChatCompletionTool(BaseModel):
    function: FunctionDefinition

    type: Literal["function"]
    """The type of the tool. Currently, only `function` is supported."""


class ArkChatParameters(BaseModel):
    frequency_penalty: Optional[float] = None
    """
    Number between -2.0 and 2.0. Positive values penalize new tokens based on their
    existing frequency in the text so far, decreasing the model's likelihood to
    repeat the same line verbatim.
    """
    logit_bias: Optional[Dict[str, int]] = None
    """
    Modify the likelihood of specified tokens appearing in the completion.
    """
    logprobs: Optional[bool] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = None
    stop: Optional[Union[Optional[str], List[str]]] = None
    stream_options: Optional[ChatCompletionStreamOptionsParam] = None
    temperature: Optional[float] = None
    tools: Optional[List[ChatCompletionTool]] = None
    top_logprobs: Optional[int] = None
    top_p: Optional[float] = None

    n: Optional[int] = Field(default=1, ge=1, le=5)
    """
    How many chat completion choices to generate for each input message. 
    Note that you will be charged based on the number of generated tokens 
    across all of the choices. 

    Keep n as 1 to minimize costs.
    """

    def merge_from(
        self, other: Union[Dict[str, Any], ArkChatParameters]
    ) -> ArkChatParameters:
        other_dict = other if isinstance(other, dict) else other.dict()
        merged_dict = self.dict()

        for key in merged_dict.keys():
            value = other_dict.get(key, None)
            if value is not None:
                merged_dict[key] = value

        return self.__class__(**merged_dict)

    def merge_to(
        self, other: Union[Dict[str, Any], ArkChatParameters]
    ) -> ArkChatParameters:
        self_dict = self.dict()
        merged_dict = other if isinstance(other, dict) else other.dict()

        for key in self_dict.keys():
            value = self_dict.get(key, None)
            if value is not None:
                merged_dict[key] = value

        return self.__class__(**merged_dict)


class ArkContextParameters(BaseModel):
    mode: Literal["session", "common_prefix"] = "session"
    """
    The mode of the context.
    """
    messages: List[ChatCompletionMessageParam]
    """
    The initial messages for the context.
    """
    ttl: Optional[TTLTypes] = None
    """
    The TTL of the context.
    """
    truncation_strategy: Optional[TruncationStrategy] = None
    """
    The truncation strategy of the context.
    """


class Function(BaseModel):
    arguments: str
    """
    The arguments to call the function with, as generated by the model in JSON
    format. Note that the model does not always generate valid JSON, and may
    hallucinate parameters not defined by your function schema. Validate the
    arguments in your code before calling your function.
    """

    name: str
    """The name of the function to call."""


class ChatCompletionMessageToolCallParam(BaseModel):
    id: str
    """The ID of the tool call."""

    function: Function
    """The function that the model called."""

    type: Literal["function"]
    """The type of the tool. Currently, only `function` is supported."""


class ChatCompletionMessageImageUrlPartImageUrl(BaseModel):
    url: str
    detail: Optional[str] = None


class ChatCompletionMessageImageUrlPart(BaseModel):
    type: Literal["image_url"]
    image_url: ChatCompletionMessageImageUrlPartImageUrl


class ChatCompletionMessageTextPart(BaseModel):
    type: Literal["text"]
    text: str


ChatCompletionMessagePart = Annotated[
    Union[ChatCompletionMessageImageUrlPart, ChatCompletionMessageTextPart],
    Field(discriminator="type"),
]


class ArkMessage(BaseModel):
    role: Literal["user", "system", "assistant", "tool"]
    content: Union[str, List[ChatCompletionMessagePart]]
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[ChatCompletionMessageToolCallParam]] = None

    @classmethod
    @model_validator(mode="before")
    def validate_content(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        role, content = v.get("role"), v.get("content")
        if not isinstance(content, str) and role != "user":
            raise InvalidParameter(
                parameter="content",
                cause=f"content must be type of str when role is {role}",
            )

        tool_call_id = v.get("tool_call_id")
        if tool_call_id is not None and role != "tool":
            raise InvalidParameter(
                parameter="tool_call_id",
                cause=f"tool_call_id must be None when role is {role}",
            )

        tool_calls = v.get("tool_calls")
        if tool_calls is not None and role != "assistant":
            raise InvalidParameter(
                parameter="tool_calls",
                cause=f"tool_calls must be None when role is {role}",
            )
        return v


class ArkChatRequest(Request):
    messages: List[ArkMessage]
    """
    chat messages 
    """
    model: str
    """
    bot id
    """
    frequency_penalty: Optional[float] = None
    """
    Number between -2.0 and 2.0. Positive values penalize new tokens based on their
    existing frequency in the text so far, decreasing the model's likelihood to
    repeat the same line verbatim.
    """
    logit_bias: Optional[Dict[str, int]] = None
    """
    Modify the likelihood of specified tokens appearing in the completion.
    """
    logprobs: Optional[bool] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = None
    stop: Optional[Union[Optional[str], List[str]]] = None
    stream: bool = False
    stream_options: Optional[ChatCompletionStreamOptionsParam] = None
    temperature: Optional[float] = None
    tools: Optional[List[ChatCompletionTool]] = None
    top_logprobs: Optional[int] = None
    top_p: Optional[float] = None
    user: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    n: Optional[int] = Field(default=1, ge=1, le=5)
    """
    How many chat completion choices to generate for each input message. 
    Note that you will be charged based on the number of generated tokens 
    across all of the choices. 

    Keep n as 1 to minimize costs.
    """

    def get_user_info_extra(self) -> Optional[UserInfoExtra]:
        if not self.metadata or not self.metadata.get("user_info"):
            return None
        user_info = self.metadata.get("user_info", "")
        if isinstance(user_info, str):
            return UserInfoExtra.model_validate_json(user_info)
        else:
            return UserInfoExtra.model_validate(user_info)

    def is_emit_intention_signal_extra(self) -> bool:
        if not self.metadata:
            return False
        intention_signal = self.metadata.get("emit_intention_signal_extra", "false")
        if isinstance(intention_signal, bool):
            return intention_signal
        else:
            return intention_signal == "true"

    def get_chat_request(
        self, extra_body: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        dumped_dict = self.model_dump(exclude_unset=True, exclude_none=True)

        extra_body = extra_body or {}
        if "metadata" in dumped_dict:
            extra_body["metadata"] = dumped_dict.pop("metadata")
        dumped_dict["extra_body"] = extra_body
        return dumped_dict

    @classmethod
    @field_validator("messages")
    def validate_messages(
        cls, v: Optional[List[ArkMessage]]
    ) -> Optional[List[ArkMessage]]:
        if not v:
            raise MissingParameter("messages")

        for msg in v:
            if not msg.role:
                raise MissingParameter("role")
            if msg.content is None:
                msg.content = ""

            if msg.role == "tool" and not msg.tool_call_id:
                raise MissingParameter("tool_call_id")

        return v


class ToolOutputType(str, Enum):
    TOOL = "tool"
    EXCEPTION = "exception"


class ExceptionInfo(BaseModel):
    type: Optional[str] = None
    message: Optional[str] = None


class ToolOutput(BaseModel):
    type: ToolOutputType
    data: Optional[Union[Any, ExceptionInfo]] = None


class ActionUsage(BaseModel):
    action_name: Optional[str] = None
    """
    action name 
    """
    count: Optional[int] = None
    """
    count for calling the action
    """

    def __iadd__(
        self, others: Union[ActionUsage, List[ActionUsage]]
    ) -> List[ActionUsage]:
        if not isinstance(others, list):
            return [self, others]
        else:
            others.append(self)
            return others

    def __add__(
        self, others: Union[ActionUsage, List[ActionUsage]]
    ) -> List[ActionUsage]:
        if not isinstance(others, list):
            return [self, others]
        else:
            others.append(self)
            return others


class ActionDetail(BaseModel):
    name: str
    """
    action name, e.g. "CodeSandbox"
    """
    count: int = 0
    """
    count for calling the action, e.g. 1
    """
    tool_details: List[ToolDetail] = Field(default_factory=list)
    """
    details about calling the tool
    """


class ToolDetail(BaseModel):
    name: str
    """
    tool name, e.g. "Search"
    """
    input: Any
    """
    input for calling the tool
    """
    output: Union[Any, ToolOutput]
    """
    output for calling the tool
    """
    created_at: Optional[int] = None
    """
    created time in milliseconds since the Epoch.
    """
    completed_at: Optional[int] = None
    """
    completed time in milliseconds since the Epoch.
    """


class BotUsage(BaseModel):
    model_usage: Optional[List[CompletionUsage]] = Field(default_factory=list)  # type: ignore
    action_usage: Optional[List[ActionUsage]] = Field(default_factory=list)  # type: ignore
    action_details: Optional[List[ActionDetail]] = Field(default_factory=list)  # type: ignore

    def __iadd__(self, others: Union[BotUsage, List[BotUsage]]) -> BotUsage:
        if not isinstance(others, list):
            others = [others]

        for usage in others:
            if self.model_usage and usage.model_usage:
                self.model_usage.extend(usage.model_usage)
            elif usage.model_usage:
                self.model_usage = usage.model_usage

            if self.action_usage and usage.action_usage:
                self.action_usage.extend(usage.action_usage)
            elif usage.action_usage:
                self.action_usage = usage.action_usage

            if self.action_details and usage.action_details:
                self.action_details.extend(usage.action_details)
            elif usage.action_details:
                self.action_details = usage.action_details

        return self

    def __add__(self, others: Union[BotUsage, List[BotUsage]]) -> BotUsage:
        if not isinstance(others, list):
            others = [others]

        total_usage = BotUsage(
            model_usage=self.model_usage or [],
            action_usage=self.action_usage or [],
            action_details=self.action_details or [],
        )
        for usage in others:
            if (
                usage.action_usage
                and total_usage.action_usage
                and len(usage.action_usage) > 0
            ):
                total_usage.action_usage.extend(usage.action_usage)
            if (
                usage.model_usage
                and total_usage.model_usage
                and len(usage.model_usage) > 0
            ):
                total_usage.model_usage.extend(usage.model_usage)
            if (
                usage.action_details
                and total_usage.action_details
                and len(usage.action_details) > 0
            ):
                total_usage.action_details.extend(usage.action_details)

        return total_usage


class ArkChatResponse(Response):
    id: str
    """A unique identifier for the chat completion."""

    choices: List[Choice]
    """A list of chat completion choices.

    Can be more than one if `n` is greater than 1.
    """

    created: int
    """The Unix timestamp (in seconds) of when the chat completion was created."""

    model: str
    """The model used for the chat completion."""

    object: Literal["chat.completion"]
    """The object type, which is always `chat.completion`."""

    usage: Optional[CompletionUsage] = None
    """Usage statistics for the completion request."""

    bot_usage: Optional[BotUsage] = None

    metadata: Optional[Dict[str, Any]] = None

    @staticmethod
    def merge(
        responses: List[Union[ArkChatResponse, ChatCompletion, ContextChatCompletion]],
    ) -> ArkChatResponse:
        assert len(responses) > 0, "empty responses"

        """
        to ensure the `merged` have attributes `usage`
        handle the responses in reversed order
        """
        merged = ArkChatResponse(**responses[-1].__dict__)
        for resp in reversed(responses[:-1]):
            for i, j in zip(merged.choices, resp.choices):
                if isinstance(i.message.content, str) and isinstance(
                    j.message.content, str
                ):
                    i.message.content = j.message.content + i.message.content
                elif isinstance(i.message.content, list) and isinstance(
                    j.message.content, list
                ):
                    i.message.content = j.message.content + i.message.content
                else:
                    raise TypeError("no supported merge type")

            if merged.usage and resp.usage:
                merged.usage.prompt_tokens += resp.usage.prompt_tokens
                merged.usage.completion_tokens += resp.usage.completion_tokens
                merged.usage.total_tokens += resp.usage.total_tokens

        return merged

    def merge_usages(
        self, others: Union[CompletionUsage, List[CompletionUsage]]
    ) -> CompletionUsage:
        if not others:
            return self.usage

        if not isinstance(others, list):
            others = [others]

        total_usage = CompletionUsage(
            prompt_tokens=self.usage.prompt_tokens if self.usage else 0,
            completion_tokens=self.usage.completion_tokens if self.usage else 0,
            total_tokens=self.usage.total_tokens if self.usage else 0,
        )
        for usage in others:
            total_usage.prompt_tokens += usage.prompt_tokens
            total_usage.completion_tokens += usage.completion_tokens
            total_usage.total_tokens += usage.total_tokens

        self.usage = total_usage
        return total_usage


class ArkChatCompletionChunk(Response):
    id: str
    """A unique identifier for the chat completion. Each chunk has the same ID."""

    choices: List[completion_chunk.Choice]
    """A list of chat completion choices.

    Can be more than one if `n` is greater than 1.
    """

    created: int
    """The Unix timestamp (in seconds) of when the chat completion was created.

    Each chunk has the same timestamp.
    """

    model: str
    """The model to generate the completion."""

    object: Literal["chat.completion.chunk"]
    """The object type, which is always `chat.completion.chunk`."""

    usage: Optional[CompletionUsage] = None
    """
    An optional field that will only be present when you set
    `stream_options: {"include_usage": true}` in your request. When present, it
    contains a null value except for the last chunk which contains the token usage
    statistics for the entire request.
    """

    bot_usage: Optional[BotUsage] = None

    metadata: Optional[Dict[str, Any]] = None

    @staticmethod
    def merge(
        responses: List[
            Union[
                ArkChatCompletionChunk,
                completion_chunk.ChatCompletionChunk,
                ContextChatCompletionChunk,
            ]
        ],
    ) -> Optional[ArkChatCompletionChunk]:
        if len(responses) == 0:
            return None

        """
        to ensure the `merged` have attributes `usage`
        handle the responses in reversed order
        """
        merged = ArkChatCompletionChunk(**responses[-1].__dict__)
        for resp in reversed(responses[:-1]):
            for i, j in zip(merged.choices, resp.choices):
                if isinstance(i.delta.content, str) and isinstance(
                    j.delta.content, str
                ):
                    i.delta.content = j.delta.content + i.delta.content
                elif isinstance(i.delta.content, list) and isinstance(
                    j.delta.content, list
                ):
                    i.delta.content = j.delta.content + i.delta.content
                else:
                    raise TypeError("no supported merge type")

            if merged.usage and resp.usage:
                merged.usage.prompt_tokens += resp.usage.prompt_tokens
                merged.usage.completion_tokens += resp.usage.completion_tokens
                merged.usage.total_tokens += resp.usage.total_tokens

        return merged

    def merge_usages(
        self, others: Union[CompletionUsage, List[CompletionUsage]]
    ) -> CompletionUsage:
        if not others:
            return self.usage

        if not isinstance(others, list):
            others = [others]

        total_usage = CompletionUsage(
            prompt_tokens=self.usage.prompt_tokens if self.usage else 0,
            completion_tokens=self.usage.completion_tokens if self.usage else 0,
            total_tokens=self.usage.total_tokens if self.usage else 0,
        )
        for usage in others:
            total_usage.prompt_tokens += usage.prompt_tokens
            total_usage.completion_tokens += usage.completion_tokens
            total_usage.total_tokens += usage.total_tokens

        self.usage = total_usage
        return total_usage

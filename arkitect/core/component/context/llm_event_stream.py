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

import json
from typing import (
    Any,
    AsyncIterable,
    Callable,
    Dict,
    List,
    Optional,
)

from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.chat import (
    ChatCompletionMessageParam,
)
from volcenginesdkarkruntime.types.context import CreateContextResponse

from arkitect.core.client import default_ark_client
from arkitect.core.component.agent import BaseAgent
from arkitect.core.component.context.hooks import (
    HookInterruptException,
    PostLLMCallHook,
    PostToolCallHook,
    PreLLMCallHook,
    PreToolCallHook,
)
from arkitect.core.component.tool.mcp_client import MCPClient
from arkitect.core.component.tool.tool_pool import ToolPool, build_tool_pool
from arkitect.types.llm.model import (
    ArkChatParameters,
    ArkContextParameters,
    ArkMessage,
)
from arkitect.types.responses.event import (
    BaseEvent,
    StateUpdateEvent,
    ToolCallEvent,
    ToolCompletedEvent,
)

from .chat_completion import _AsyncChat
from .context_completion import _AsyncContext
from .model import ContextInterruption, State


class _AsyncCompletionsEventStream:
    def __init__(self, ctx: "LLMEventStream"):
        self._ctx = ctx
        self.model = ctx.model

    async def create(
        self,
        messages: List[ChatCompletionMessageParam],
        **kwargs: Dict[str, Any],
    ) -> AsyncIterable[BaseEvent | ContextInterruption]:
        async def iterator(
            messages: List[ChatCompletionMessageParam],
        ) -> AsyncIterable[BaseEvent | ContextInterruption]:
            yield StateUpdateEvent(message_delta=[ArkMessage(**m) for m in messages])
            if self.need_tool_call():
                try:
                    async for event in self.tool_call_stream():
                        yield event
                except HookInterruptException as he:
                    yield ContextInterruption(
                        life_cycle="tool_call",
                        reason=he.reason,
                        state=self._ctx.state,
                        details=he.details,
                    )
                    return

            while True:
                try:
                    if self._ctx.pre_llm_call_hook:
                        self._ctx.state = (
                            await self._ctx.pre_llm_call_hook.pre_llm_call(
                                self._ctx.state
                            )
                        )
                except HookInterruptException as he:
                    yield ContextInterruption(
                        life_cycle="llm_call",
                        reason=he.reason,
                        state=self._ctx.state,
                        details=he.details,
                    )
                    return
                resp = (
                    await self._ctx.chat_service.completions.create_event_stream(
                        model=self.model,
                        messages=self._ctx.build_chat_message(),
                        tool_pool=self._ctx.tool_pool,
                        **kwargs,
                    )
                    if not self._ctx.state.context_id
                    else await self._ctx.context_chat_service.completions.create(
                        model=self.model,
                        messages=messages,
                        stream=True,
                        **kwargs,
                    )
                )
                assert isinstance(resp, AsyncIterable)
                async for chunk in resp:
                    yield chunk
                messages = []

                try:
                    if self._ctx.post_llm_call_hook:
                        self._ctx.state = (
                            await self._ctx.post_llm_call_hook.post_llm_call(
                                self._ctx.state
                            )
                        )
                except HookInterruptException as he:
                    yield ContextInterruption(
                        life_cycle="llm_call",
                        reason=he.reason,
                        state=self._ctx.state,
                        details=he.details,
                    )
                    return

                if self.need_agent_call():
                    try:
                        async for event in self.agent_call_stream():
                            yield event
                    except HookInterruptException as he:
                        yield ContextInterruption(
                            life_cycle="agent_call",
                            reason=he.reason,
                            state=self._ctx.state,
                            details=he.details,
                        )
                        return
                elif self.need_tool_call():
                    try:
                        async for event in self.tool_call_stream():
                            yield event
                    except HookInterruptException as he:
                        yield ContextInterruption(
                            life_cycle="tool_call",
                            reason=he.reason,
                            state=self._ctx.state,
                            details=he.details,
                        )
                        return
                else:
                    break

        return iterator(messages)

    async def execute_tool(
        self, tool_name: str, parameters: str
    ) -> tuple[Any | None, Exception | None]:
        tool_resp, tool_exception = None, None
        try:
            tool_resp = await self._ctx.tool_pool.execute_tool(  # type: ignore
                tool_name=tool_name, parameters=json.loads(parameters)
            )
        except Exception as e:
            tool_exception = e
        return tool_resp, tool_exception

    def need_tool_call(self) -> bool:
        last_message = self._ctx.get_latest_message()
        if (
            last_message is not None
            and last_message.tool_calls
            and self._ctx.tool_pool is not None
        ):
            return True
        return False

    async def tool_call_stream(self) -> AsyncIterable[BaseEvent]:
        tool_calls = self._ctx.get_latest_message().tool_calls  # type: ignore
        for tool_call in tool_calls:
            tool_name = tool_call.function.name
            arguments = tool_call.function.arguments
            if self._ctx.pre_tool_call_hook:
                if event := await self._ctx.pre_tool_call_hook.pre_tool_call(
                    tool_name,
                    arguments,
                    self._ctx.state,
                ):
                    yield event
            updated_arguments = tool_call.function.arguments

            yield ToolCallEvent(
                tool_call_id=tool_call.id,
                tool_name=tool_name,
                tool_arguments=updated_arguments,
            )
            resp, exceptions = await self.execute_tool(tool_name, updated_arguments)
            yield ToolCompletedEvent(
                tool_call_id=tool_call.id,
                tool_name=tool_name,
                tool_arguments=updated_arguments,
                tool_exception=exceptions,
                tool_response=resp,
            )
            yield StateUpdateEvent(
                message_delta=[
                    ArkMessage(
                        **{
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": resp,
                        }
                    )
                ]
            )
            if self._ctx.post_tool_call_hook:
                if event := await self._ctx.post_tool_call_hook.post_tool_call(
                    name=tool_name,
                    arguments=arguments,
                    response=resp,
                    exception=exceptions,
                    state=self._ctx.state,
                ):
                    yield event

    def need_agent_call(self) -> bool:
        last_message = self._ctx.get_latest_message()
        if last_message is not None and last_message.tool_calls:
            if "switch_agent" in last_message.tool_calls[0].function.name:
                return True
        return False

    async def agent_call_stream(self) -> AsyncIterable[BaseEvent]:
        tool_calls = self._ctx.get_latest_message().tool_calls  # type: ignore
        agent_call = tool_calls[0]
        tool_name = agent_call.function.name
        arguments = agent_call.function.arguments
        assert tool_name == "switch_agent"
        agent_name = json.loads(arguments).get("agent_name")
        if agent_name is None:
            raise ValueError("agent_name is None")
        agent = self.get_agent(agent_name)
        yield StateUpdateEvent(
            message_delta=[
                ArkMessage(
                    **{
                        "role": "tool",
                        "tool_call_id": agent_call.id,
                        "content": f"切换到{agent_name}Agent",
                    }
                )
            ]
        )
        async for event in agent(self._ctx.state):
            yield event

    def get_agent(self, agent_name: str) -> BaseAgent:
        for agent in self._ctx.sub_agents:
            if agent.name == agent_name:
                return agent


def build_switch_agent(agents: list[BaseAgent]):
    def switch_agent(agent_name: str):
        return agent_name

    agents_desc = ""

    for agent in agents:
        agents_desc += f"{agent.name}: {agent.description}\n"

    switch_agent.__doc__ = f"""你可以通过调用此函数 switch_agent 将任务切换给其他Agent。
    
    agent_name列表及其功能如下所述：
    {agents_desc}
    
    请你根据上面这些agent的描述和目前所在的任务，调用switch_agent 这个方法
    来决定要切换到哪个Agent。不要输出任何其他内容。

    参数说明：
        •	agent_name(str)：要切换到的Agent名称。
    """

    return switch_agent


class LLMEventStream:
    def __init__(
        self,
        *,
        model: str,
        agent_name: str,
        state: State | None = None,
        tools: list[MCPClient | Callable] | ToolPool | None = None,
        sub_agents: list[BaseAgent] | None = None,
        parameters: Optional[ArkChatParameters] = None,
        context_parameters: Optional[ArkContextParameters] = None,
        client: Optional[AsyncArk] = None,
        instruction: str | None = None,
    ):
        self.model = model
        self.agent_name = agent_name
        self.state = (
            state
            if state
            else State(
                context_id="",
                messages=[],
                parameters=parameters,
                context_parameters=context_parameters,
            )
        )
        self.client = default_ark_client() if client is None else client
        self.chat_service = _AsyncChat(client=self.client, state=self.state)
        if context_parameters is not None:
            self.context_chat_service = _AsyncContext(
                client=self.client, state=self.state
            )
        self.sub_agents = sub_agents
        full_tools = []
        if self.sub_agents and len(self.sub_agents) > 0:
            full_tools = [build_switch_agent(self.sub_agents)]
        if tools and len(tools) > 0:
            full_tools.extend(tools)
        self.tool_pool = build_tool_pool(full_tools)
        self.pre_tool_call_hook: PreToolCallHook | None = None
        self.post_tool_call_hook: PostToolCallHook | None = None
        self.pre_llm_call_hook: PreLLMCallHook | None = None
        self.post_llm_call_hook: PostLLMCallHook | None = None
        self.instruction = instruction

    async def init(self) -> None:
        if self.state.context_parameters is not None:
            resp: CreateContextResponse = await self.context_chat_service.create(
                model=self.model,
                mode=self.state.context_parameters.mode,
                messages=self.state.context_parameters.messages,
                ttl=self.state.context_parameters.ttl,
                truncation_strategy=self.state.context_parameters.truncation_strategy,
            )
            self.state.context_id = resp.id
        if self.tool_pool:
            await self.tool_pool.refresh_tool_list()
        return

    def get_latest_message(self, role: str = "assistant") -> Optional[ArkMessage]:
        return self.state.messages[-1]

    def build_chat_message(self) -> list[ChatCompletionMessageParam]:
        if self.instruction:
            messages = [
                {
                    "role": "system",
                    "content": self.instruction,
                }
            ]
        else:
            messages = []
        for e in self.state.events:
            if m := build_messages(e, self.agent_name):
                messages.extend(m)
        return messages

    @property
    def completions(self) -> _AsyncCompletionsEventStream:
        return _AsyncCompletionsEventStream(self)

    def set_pre_tool_call_hook(self, hook: PreToolCallHook) -> None:
        self.pre_tool_call_hook = hook

    def set_post_tool_call_hook(self, hook: PostToolCallHook) -> None:
        self.post_tool_call_hook = hook

    def set_pre_llm_call_hook(self, hook: PreLLMCallHook) -> None:
        self.pre_llm_call_hook = hook

    def set_post_llm_call_hook(self, hook: PostLLMCallHook) -> None:
        self.post_llm_call_hook = hook


def get_role(role: str, agent_name: str, author_name: str) -> str:
    if role != "assistant":
        return role
    if author_name == agent_name:
        return "assistant"
    return "user"


def get_message(message: ArkMessage, agent_name: str, author_name: str) -> dict:
    msg = message.model_dump()
    if message.role == "assistant":
        role = get_role(message.role, agent_name, author_name)
        msg["role"] = role
    return msg


def build_messages(
    event: BaseEvent, agent_name: str
) -> list[ChatCompletionMessageParam] | None:
    if not isinstance(event, StateUpdateEvent):
        return None
    if not event.message_delta:
        return None
    return [get_message(m, agent_name, event.author) for m in event.message_delta]

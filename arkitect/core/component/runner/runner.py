# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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

from typing import AsyncIterable

from arkitect.core.component.agent import BaseAgent
from arkitect.core.component.checkpoint import BaseCheckpointStore
from arkitect.core.component.checkpoint.checkpoint import Checkpoint
from arkitect.core.component.context.model import State
from arkitect.telemetry.logger import ERROR
from arkitect.types.llm.model import ArkMessage
from arkitect.types.responses.event import BaseEvent, StateUpdateEvent


class Runner:
    def __init__(
        self,
        app_name: str,
        agent: BaseAgent,
        checkpoint_store: BaseCheckpointStore,
    ):
        self.app_name = app_name
        self.agent = agent
        self.checkpoint_store = checkpoint_store

    async def run(self, checkpoint_id: str, messages: list[ArkMessage] | None = None):
        checkpoint: Checkpoint = await self.get_or_create_checkpoint(
            checkpoint_id=checkpoint_id
        )
        state = checkpoint.state
        assert state
        async for chunk in self.__run(state, checkpoint, messages):
            if isinstance(chunk, BaseEvent):
                yield chunk

    async def process_event(
        self, event: BaseEvent, state: State, checkpoint: Checkpoint
    ) -> AsyncIterable[BaseEvent]:
        if isinstance(event, StateUpdateEvent):
            if event.details_delta is not None:
                state.details.update(event.details_delta)
            if event.message_delta is not None:
                state.messages.extend(event.message_delta)
                state.events.append(event)
            await self.checkpoint_store.update_checkpoint(
                self.app_name, checkpoint.id, checkpoint
            )
            return
        yield event

    async def __run(
        self,
        state: State,
        checkpoint: Checkpoint,
        messages: list[ArkMessage] | None = None,
    ) -> AsyncIterable[BaseEvent]:
        if messages is not None:
            append_messages = StateUpdateEvent(
                author="user",
                message_delta=messages,
            )
            async for event in self.process_event(append_messages, state, checkpoint):
                continue
        try:
            async for event in self.agent(state):
                async for event in self.process_event(event, state, checkpoint):
                    yield event
        except Exception as e:
            ERROR(f"I have error: {e}")
        finally:
            await self.checkpoint_store.update_checkpoint(
                self.app_name, checkpoint.id, checkpoint
            )

    async def get_or_create_checkpoint(self, checkpoint_id: str) -> Checkpoint:
        checkpoint = await self.checkpoint_store.get_checkpoint(
            app_name=self.app_name, checkpoint_id=checkpoint_id
        )
        if checkpoint is None:
            checkpoint = await self.checkpoint_store.create_checkpoint(
                app_name=self.app_name,
                checkpoint_id=checkpoint_id,
            )
        return checkpoint

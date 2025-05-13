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

import asyncio
from typing import AsyncIterable

from arkitect.core.component.context.model import State
from arkitect.types.responses.event import BaseEvent
from arkitect.core.component.agent.base_agent import BaseAgent


"""
ParallelAgent is the core interface for all runnable agents
"""


async def _merge_agent_run(
    agent_runs: list[AsyncIterable[BaseEvent]],
) -> AsyncIterable[BaseEvent]:
    """Merges the agent run event generator.

    This implementation guarantees for each agent, it won't move on until the
    generated event is processed by upstream runner.

    Args:
        agent_runs: A list of async generators that yield events from each agent.

    Yields:
        Event: The next event from the merged generator.
    """
    tasks = [
        asyncio.create_task(events_for_one_agent.__anext__())
        for events_for_one_agent in agent_runs
    ]
    pending_tasks = set(tasks)

    while pending_tasks:
        done, pending_tasks = await asyncio.wait(
            pending_tasks, return_when=asyncio.FIRST_COMPLETED
        )
        for task in done:
            try:
                yield task.result()

                # Find the generator that produced this event and move it on.
                for i, original_task in enumerate(tasks):
                    if task == original_task:
                        new_task = asyncio.create_task(agent_runs[i].__anext__())
                        tasks[i] = new_task
                        pending_tasks.add(new_task)
                        break  # stop iterating once found

            except StopAsyncIteration:
                continue


class ParallelAgent(BaseAgent):

    # stream run step
    async def _astream(self, state: State, **kwargs) -> AsyncIterable[BaseEvent]:
        agent_runs = [agent(state) for agent in self.sub_agents]
        async for event in _merge_agent_run(agent_runs):
            yield event

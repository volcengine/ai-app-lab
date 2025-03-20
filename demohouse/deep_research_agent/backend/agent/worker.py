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

from typing import AsyncIterable, Optional

from pydantic import Field
from jinja2 import Template

from agent.agent import Agent, AgentStepChunk
from arkitect.core.component.context.context import Context
from arkitect.core.component.context.model import State
from models.planning import PlanningItem, Planning
from prompt.worker import DEFAULT_WORKER_PROMPT


class WorkerAgent(Agent):
    planning: Planning = Field(default_factory=Planning)
    planning_item: PlanningItem = Field(default_factory=PlanningItem)
    state: Optional[State] = None
    system_prompt: str = DEFAULT_WORKER_PROMPT

    async def astream_step(self, **kwargs) -> AsyncIterable[AgentStepChunk]:
        ctx = Context(
            model=self.llm_model,
            tools=self.tools,
            state=self.state,
        )
        await ctx.init()
        ctx.add_pre_tool_call_hook(self.before_tool_call_hook)
        ctx.add_post_tool_call_hook(self.before_tool_call_hook)

        rsp_stream = await ctx.completions.create(
            messages=[
                {"role": "system", "content": self.generate_system_prompt()},
            ]
        )

    def generate_system_prompt(self) -> str:
        return Template(self.system_prompt).render(
            instruction=self.instruction,
            complex_task=self.planning.root_task,
            planning_details=self.planning.to_markdown_str(include_progress=False),
            task_id=str(self.planning_item.id),
            task_description=self.planning_item.description,
        )

    async def before_tool_call_hook(self, state: State) -> State:
        print(f"before tool call {state}")
        return state

    async def post_tool_call_hook(self, state: State) -> State:
        print(f"after tool call {state}")
        return state

    def get_result(self) -> PlanningItem:
        return self.planning_item

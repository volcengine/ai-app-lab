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

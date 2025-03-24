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

from typing import AsyncIterable, Optional, Any

from pydantic import Field, BaseModel
from jinja2 import Template
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import Agent, AgentStepChunk
from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import PostToolCallHook
from arkitect.core.component.context.model import State
from models.messages import OutputTextChunk, ReasoningChunk
from models.planning import PlanningItem, Planning
from prompt.worker import DEFAULT_WORKER_PROMPT


class PlanningRecordHook(BaseModel, PostToolCallHook):
    planning_item: PlanningItem = Field(default_factory=PlanningItem)

    async def post_tool_call(self, name: str, arguments: str, response: Any, exception: Optional[Exception],
                             state: State) -> State:
        self.planning_item.process_records.append(
            f"执行工具调用{'成功' if not exception else '失败'}：{name} 参数：{arguments} 结果：{response or exception}"
        )
        return state


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
        ctx.add_post_tool_call_hook(PlanningRecordHook(planning_item=self.planning_item))

        rsp_stream = await ctx.completions.create(
            messages=[
                {"role": "system", "content": self.generate_system_prompt()},
            ]
        )

        async for chunk in rsp_stream:
            # TODO yield tool calls
            # if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.tool_calls:
            #     yield ToolCallEvent(type="")
            if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.content:
                yield OutputTextChunk(delta=chunk.choices[0].delta.content)
            if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.reasoning_content:
                yield ReasoningChunk(delta=chunk.choices[0].delta.reasoning_content)

        # after all we tidy the final result
        last_message = ctx.get_latest_message()
        if last_message:
            self.planning_item.result_summary = last_message.get("content")

    def generate_system_prompt(self) -> str:
        return Template(self.system_prompt).render(
            instruction=self.instruction,
            complex_task=self.planning.root_task,
            planning_details=self.planning.to_markdown_str(include_progress=False),
            task_id=str(self.planning_item.id),
            task_description=self.planning_item.description,
        )

    def get_result(self) -> PlanningItem:
        return self.planning_item


if __name__ == "__main__":
    def add(a: int, b: int) -> int:
        """Add two numbers

        Args:
            a (int): first number
            b (int): second number

        Returns:
            int: sum of a and b
        """
        return a + b


    async def main() -> None:

        planning_item = PlanningItem(
            id='1',
            description="计算 1 + 19",
        )

        agent = WorkerAgent(
            llm_model="deepseek-r1-250120",
            instruction="数据计算专家，会做两位数的加法",
            tools=[add],
            planning=Planning(root_task="计算给定的题目", items={"1": planning_item}),
            planning_item=planning_item
        )

        async for chunk in agent.astream_step():
            if isinstance(chunk, OutputTextChunk):
                print(chunk.delta, end="")
            if isinstance(chunk, ReasoningChunk):
                print(chunk.delta, end="")

        print(agent.get_result())


    import asyncio

    asyncio.run(main())

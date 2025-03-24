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

import json
from typing import AsyncIterator, Union, Any, Optional

from jinja2 import Template
from pydantic import BaseModel
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import AgentTemplate
from agent.worker import WorkerAgent
from arkitect.core.component.context.context import Context
from arkitect.core.component.context.hooks import PostToolCallHook, HookInterruptException
from arkitect.core.component.context.model import State, ContextInterruption
from arkitect.telemetry.logger import INFO
from models.messages import MessageChunk, OutputTextChunk, ReasoningChunk
from models.planning import Planning, PlanningItem
from models.tool_events import AssignTodoToolCompletedEvent
from supervisor.supervisor import Supervisor
from prompt.supervisor import ASSIGN_TODO_PROMPT, ACCEPT_AGENT_RESPONSE


class SupervisorControlHook(PostToolCallHook):
    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(self, name: str, arguments: str, response: Any, exception: Optional[Exception],
                             state: State) -> State:
        if name not in ['_assign_next_todo', '_accept_agent_response']:
            # pass
            return state
        if exception:
            raise HookInterruptException(
                reason='exception',
                details=exception,
                state=state,
            )
        else:
            raise HookInterruptException(
                reason='finished',
                details=response,
                state=state
            )


class AssignWorkerResponse(BaseModel):
    agent_name: str
    task_id: str


class AcceptAgentResponse(BaseModel):
    accept: bool
    append_description: str = ''


class DefaultSupervisor(Supervisor, BaseModel):
    assign_prompt: str = ASSIGN_TODO_PROMPT
    accept_prompt: str = ACCEPT_AGENT_RESPONSE
    control_hook: SupervisorControlHook = SupervisorControlHook()

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def astream_assign_next_todo(self, **kwargs) -> AsyncIterator[
        Union[MessageChunk, AssignTodoToolCompletedEvent]
    ]:
        ctx = Context(
            model=self.llm_model,
            tools=[self._assign_next_todo],
        )
        await ctx.init()
        ctx.add_post_tool_call_hook(self.control_hook)

        rsp_stream = await ctx.completions.create(
            messages=[
                {"role": "system", "content": self._prepare_assign_prompt()}
            ]
        )

        async for chunk in rsp_stream:
            if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.content:
                yield OutputTextChunk(delta=chunk.choices[0].delta.content)
            if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.reasoning_content:
                yield ReasoningChunk(delta=chunk.choices[0].delta.reasoning_content)
            if isinstance(chunk, ContextInterruption):
                assign = AssignWorkerResponse(**json.loads(chunk.details))
                yield AssignTodoToolCompletedEvent(
                    planning_item=self.planning.get_item(assign.task_id),
                    worker_agent=assign.agent_name,
                )

    async def receive_step(self, planning_item: PlanningItem) -> AsyncIterator[MessageChunk]:
        ctx = Context(
            model=self.llm_model,
            tools=[self._accept_agent_response],
        )
        await ctx.init()
        ctx.add_post_tool_call_hook(self.control_hook)

        rsp_stream = await ctx.completions.create(
            messages=[
                {"role": "system", "content": self._prepare_accept_prompt(planning_item)}
            ]
        )

        async for chunk in rsp_stream:
            if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.content:
                yield OutputTextChunk(delta=chunk.choices[0].delta.content)
            if isinstance(chunk, ChatCompletionChunk) and chunk.choices[0].delta.reasoning_content:
                yield ReasoningChunk(delta=chunk.choices[0].delta.reasoning_content)
            if isinstance(chunk, ContextInterruption):
                accept = AcceptAgentResponse(**json.loads(chunk.details))
                if accept.accept:
                    planning_item.done = True
                else:
                    # archive result and update description
                    planning_item.process_records.append(
                        f"中间执行结果: {planning_item.result_summary}"
                    )
                    planning_item.description += f"\n{accept.append_description}"
                self.planning.update_item(planning_item.id, planning_item)
                return

    def _prepare_assign_prompt(self) -> str:
        tpl = Template(self.assign_prompt)
        # format the agent
        return tpl.render(
            worker_agent_details=self._format_agent_desc(),
            complex_task=self.planning.root_task,
            planning_details=self.planning.to_markdown_str(include_progress=False),
        )

    def _prepare_accept_prompt(self, planning_item: PlanningItem) -> str:
        tpl = Template(self.accept_prompt)
        # format the agent
        return tpl.render(
            complex_task=self.planning.root_task,
            planning_details=self.planning.to_markdown_str(include_progress=False),
            sub_task=f"[id: {planning_item.id}] {planning_item.description}",
            planning_item_details=planning_item.to_markdown_str(),
        )

    def _format_agent_desc(self) -> str:
        descs = []
        for agent_template in self.worker_agents.values():
            descs.append(f"成员name: {agent_template.name}  成员能力: {agent_template.instruction}")
        return "\n".join(descs)

    async def _assign_next_todo(self, agent_name: str, task_id: str | int) -> AssignWorkerResponse:
        """分配一个指定任务给具体的团队成员

        Args:
            agent_name (str): 团队成员name
            task_id (str): 任务id
        """
        INFO(f"_assign_next_todo: agent_name={agent_name}, task_id={task_id}")
        return AssignWorkerResponse(agent_name=agent_name, task_id=str(task_id))

    async def _accept_agent_response(self, accept: bool, append_description: str = '') -> AcceptAgentResponse:
        """判断并标记任务执行结果是否已经足够完善，若判断任务还需要执行，补充额外的任务描述

        Args:
            accept (bool): 任务结果是否已经足够完善，可以进行下一步
            append_description (str): 如果判断任务结果不够充分，用此参数表述需要额外补充的任务描述
        """
        INFO(f"_accept_agent_response: accept={accept}, append_description={append_description}")
        return AcceptAgentResponse(accept=accept, append_description=append_description)


if __name__ == "__main__":
    async def main():
        planning: Planning = Planning(
            root_task="判断(1+20) 和 (22 + 23) 哪个结果大",
            items={
                '1': PlanningItem(
                    id='1',
                    description='计算1+20的结果'
                ),
                '2': PlanningItem(
                    id='2',
                    description='计算22+23的结果'
                ),
                '3': PlanningItem(
                    id='3',
                    description='判断最终哪个结果大'
                )
            }
        )

        worker_agents = {
            'adder': AgentTemplate(name='adder', instruction='做加法'),
            'comparer': AgentTemplate(name='comparer', instruction='比较两个数大小'),
        }

        supervisor = DefaultSupervisor(
            planning=planning,
            worker_agents=worker_agents,
            llm_model="deepseek-r1-250120",
        )

        next_todo = None

        async for c in supervisor.astream_assign_next_todo():
            if isinstance(c, MessageChunk):
                print(c.delta, end="")
            if isinstance(c, AssignTodoToolCompletedEvent):
                next_todo = c

        worker = WorkerAgent(
            llm_model="deepseek-r1-250120",
            planning=planning,
            planning_item=next_todo.planning_item,
            **worker_agents.get(next_todo.worker_agent).__dict__,
        )

        async for ss in worker.astream_step():
            if isinstance(ss, MessageChunk):
                print(ss.delta, end="")

        async for ac in supervisor.receive_step(worker.get_result()):
            if isinstance(ac, MessageChunk):
                print(ac.delta, end="")

        print(supervisor.planning.to_markdown_str())


    import asyncio

    asyncio.run(main())

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

from typing import AsyncIterable, List

from jinja2 import Template
from volcenginesdkarkruntime.types.chat import ChatCompletionChunk

from agent.agent import Agent
from arkitect.core.component.context.context import Context, ToolChunk
from arkitect.core.component.context.hooks import PostToolCallHook
from arkitect.core.component.tool.builder import build_mcp_clients_from_config
from arkitect.types.llm.model import ArkChatParameters
from config.config import MCP_CONFIG_FILE_PATH

from models.events import BaseEvent, OutputTextEvent, ReasoningEvent, InternalServiceError, InvalidParameter
from models.planning import PlanningItem, Planning
from prompt.worker import DEFAULT_WORKER_PROMPT
from state.deep_research_state import DeepResearchState
from state.global_state import GlobalState
from tools.hooks import WebSearchPostToolCallHook
from utils.converter import convert_post_tool_call_to_event, convert_pre_tool_call_to_event


class Worker(Agent):
    system_prompt: str = DEFAULT_WORKER_PROMPT

    post_tool_call_hooks: List[PostToolCallHook] = []

    async def astream(
            self,
            global_state: GlobalState,
            **kwargs,
    ) -> AsyncIterable[BaseEvent]:

        # extract args:

        planning: Planning = global_state.custom_state.planning
        task_id = kwargs.pop('task_id')

        if not planning or not task_id or not planning.get_item(task_id):
            yield InvalidParameter(paramter="task_id")

        planning_item = planning.get_item(task_id)

        ctx = Context(
            model=self.llm_model,
            tools=self.tools,
            parameters=ArkChatParameters(
                stream_options={'include_usage': True}
            )
        )

        await ctx.init()
        for post_hook in self.post_tool_call_hooks:
            ctx.add_post_tool_call_hook(post_hook)

        rsp_stream = await ctx.completions.create_chat_stream(
            messages=[
                {"role": "system",
                 "content": self.generate_system_prompt(planning=planning, planning_item=planning_item)},
            ],
        )

        try:
            async for chunk in rsp_stream:
                self.record_usage(chunk, global_state.custom_state.total_usage)
                if isinstance(chunk, ToolChunk):
                    if chunk.tool_exception or chunk.tool_response:
                        # post
                        yield convert_post_tool_call_to_event(
                            function_name=chunk.tool_name,
                            function_parameter=chunk.tool_arguments,
                            function_result=chunk.tool_response,
                            exception=chunk.tool_exception,
                        )
                    else:
                        # pre
                        yield convert_pre_tool_call_to_event(
                            function_name=chunk.tool_name,
                            function_parameter=chunk.tool_arguments,
                        )
                if isinstance(chunk, ChatCompletionChunk) and chunk.choices and chunk.choices[0].delta.content:
                    yield OutputTextEvent(delta=chunk.choices[0].delta.content)
                if isinstance(chunk, ChatCompletionChunk) and chunk.choices and chunk.choices[
                    0].delta.reasoning_content:
                    yield ReasoningEvent(delta=chunk.choices[0].delta.reasoning_content)

            last_message = ctx.get_latest_message()
            # update planning (using a wrapper)
            planning_item.result_summary = f"\n{last_message.get('content')}\n"
            planning.update_item(task_id, planning_item)
            # end the loop
            return
        except Exception as e:
            yield InternalServiceError(error_msg=str(e))
            return

    def generate_system_prompt(self, planning: Planning, planning_item: PlanningItem) -> str:
        return Template(self.system_prompt).render(
            instruction=self.instruction,
            complex_task=planning.root_task,
            planning_detail=planning.to_markdown_str(include_progress=False, simplify=True),
            task_id=str(planning_item.id),
            task_description=planning_item.description,
        )


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
            description="马斯克是谁",
        )

        global_state = GlobalState(
            custom_state=DeepResearchState(
                planning=Planning(root_tasks='马斯克是谁', items=[planning_item])
            )
        )

        searcher = Worker(
            llm_model='deepseek-r1-250120',
            name='web_searcher',
            instruction='能够联网查询资料内容',
            tools=[
                build_mcp_clients_from_config(config_file=MCP_CONFIG_FILE_PATH).get('web_search'),
            ],
            post_tool_call_hooks=[
                WebSearchPostToolCallHook(global_state=global_state)
            ]
        )

        thinking = True

        async for chunk in searcher.astream(
                global_state=global_state,
                task_id='1',
        ):
            if isinstance(chunk, OutputTextEvent):
                if thinking:
                    thinking = False
                    print("---思考结束---")
                print(chunk.delta, end="")
            elif isinstance(chunk, ReasoningEvent):
                if not thinking:
                    print("---思考开始---")
                    thinking = True
                print(chunk.delta, end="")
            else:
                print(f"{chunk.model_dump_json()}")

        print(global_state.custom_state.planning.to_markdown_str())


    import asyncio

    asyncio.run(main())

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
from typing import Optional

from agent.worker import Worker
from deep_research.deep_research import DeepResearch
from models.events import MessageEvent, OutputTextEvent, ReasoningEvent, ToolCallEvent, ToolCompletedEvent, \
    PlanningEvent, AssignTodoEvent
from state.deep_research_state import DeepResearchState
from state.file_state_manager import FileStateManager
from tools.mock import compare, add

TASK = "比较 (1 + 23) 和 (7 + 19) 哪个更大"

WORKERS = {
    'adder': Worker(llm_model='deepseek-r1-250120', name='adder', instruction='会计算两位数的加法',
                    tools=[add]),
    'comparer': Worker(llm_model='deepseek-r1-250120', name='comparer',
                       instruction='能够比较两个数字的大小并找到最大的那个',
                       tools=[compare])
}


async def main(session_id: Optional[str] = None):
    manager = FileStateManager(path=f"/tmp/deep_research_session/{session_id}.json") if session_id else None

    dr_state = None

    if manager:
        dr_state = await manager.load()
    if not dr_state:
        dr_state = DeepResearchState(
            root_task=TASK
        )

    service = DeepResearch(
        default_llm_model="deepseek-r1-250120",
        workers=WORKERS,
        state_manager=manager,
    )

    thinking = True

    # cli print pretty format
    async for chunk in service.astream(
            dr_state=dr_state,
    ):
        if isinstance(chunk, MessageEvent):
            if isinstance(chunk, OutputTextEvent):
                if thinking:
                    print("\n---😊思考结束---")
                    thinking = False
                print(chunk.delta, end="")
            elif isinstance(chunk, ReasoningEvent):
                if not thinking:
                    print("\n---🤔思考开始---")
                    thinking = True
                print(chunk.delta, end="")
        elif isinstance(chunk, ToolCallEvent):
            print(f"\n ---🔧⏳start using tools [{chunk.type}] ---")
            print(chunk.model_dump_json())
        elif isinstance(chunk, ToolCompletedEvent):
            print(f"\n ---🔧✅end using tools [{chunk.type}] ---")
            print(chunk.model_dump_json())
        elif isinstance(chunk, PlanningEvent):
            print(f"\n --- 📖 planning {chunk.action} ---")
            print(f"********************************")
            print(chunk.planning.to_markdown_str())
            print(f"********************************")
        elif isinstance(chunk, AssignTodoEvent):
            print(
                f"\n --- 💼 assign todo [{chunk.planning_item.id}]|{chunk.planning_item.description} => 🧑‍💻{chunk.agent_name} ---")

    print("\n----💰token usage ----")
    print(dr_state.total_usage)


if __name__ == "__main__":
    asyncio.run(main())

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
    asyncio.run(main("debug-1"))

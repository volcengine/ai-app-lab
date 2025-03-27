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
from typing import Optional, Dict

from arkitect.core.component.tool import MCPClient
from arkitect.core.component.tool.builder import build_mcp_clients_from_config, spawn_mcp_server_from_config

from agent.worker import Worker
from deep_research.deep_research import DeepResearch
from models.events import MessageEvent, OutputTextEvent, ReasoningEvent, ToolCallEvent, ToolCompletedEvent, \
    PlanningEvent, AssignTodoEvent, WebSearchToolCallEvent, WebSearchToolCompletedEvent, PythonExecutorToolCallEvent, \
    PythonExecutorToolCompletedEvent, LinkReaderToolCallEvent, LinkReaderToolCompletedEvent
from state.deep_research_state import DeepResearchState
from state.file_state_manager import FileStateManager
from config.config import MCP_CONFIG_FILE_PATH
from state.global_state import GlobalState
from tools.hooks import WebSearchPostToolCallHook, PythonExecutorPostToolCallHook
from utils.converter import convert_references_to_format_str
from tools.mock import compare, add

TASK = "我有一个朋友，他在北京长大，人大附中毕业，有海外留学经验，现在是字节跳动公司的一位管理层干部，请帮我推算一下他的家庭资产是什么量级"


async def main(session_id: Optional[str] = None):
    await spawn_mcp_server_from_config(MCP_CONFIG_FILE_PATH)

    await asyncio.sleep(10)

    mcp_clients, cleanup = build_mcp_clients_from_config(config_file=MCP_CONFIG_FILE_PATH)

    manager = FileStateManager(path=f"/tmp/deep_research_session/{session_id}.json") if session_id else None

    dr_state = None

    if manager:
        dr_state = await manager.load()
    if not dr_state:
        dr_state = DeepResearchState(
            root_task=TASK
        )

    global_state = GlobalState(
        custom_state=dr_state
    )

    service = DeepResearch(
        default_llm_model="deepseek-r1-250120",
        workers=get_workers(global_state=global_state, mcp_clients=mcp_clients),
        state_manager=manager,
        reasoning_accept=False,
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
            if isinstance(chunk, WebSearchToolCallEvent):
                print(f"\n ---🌍 searching [{chunk.query}] ---")
            if isinstance(chunk, PythonExecutorToolCallEvent):
                print(f"\n ---💻 run python---")
                print(f"""```python
                {chunk.code}
                ```
                """)
            if isinstance(chunk, LinkReaderToolCallEvent):
                print(f"\n ---🕷️ run link reader {chunk.urls}---")
            else:
                print(f"\n ---🔧⏳start using tools [{chunk.type}] ---")
                print(chunk.model_dump_json())
        elif isinstance(chunk, ToolCompletedEvent):
            if isinstance(chunk, WebSearchToolCompletedEvent):
                print(f"\n ---📒 search result of [{chunk.query}] ---")
                print(f"\n[summary]: \n {chunk.summary}")
                print(f"\n[references]: \n {convert_references_to_format_str(chunk.references)}")
            elif isinstance(chunk, PythonExecutorToolCompletedEvent):
                print(f"\n ---💻 python run result ---")
                print(f"""```stdout{'✅' if chunk.success else '❌'}
                {chunk.stdout} or {chunk.error_msg}
                ```
                """)
            elif isinstance(chunk, LinkReaderToolCompletedEvent):
                print(f"\n ---🕷️link reader result ---")
                print(f"\n[results=] {chunk.results}")
            else:
                print(f"\n ---🔧✅end using tools [{chunk.type}] ---")
                print(chunk.model_dump_json())
        elif isinstance(chunk, PlanningEvent):
            print(f"\n --- 📖 planning {chunk.action} ---")
            print(f"********************************")
            print(chunk.planning.to_dashboard())
            print(f"********************************")
        elif isinstance(chunk, AssignTodoEvent):
            print(
                f"\n --- 💼 assign todo [{chunk.planning_item.id}]|{chunk.planning_item.description} => 🧑‍💻{chunk.agent_name} ---")

    print("\n----💰token usage ----")
    print(dr_state.total_usage)

    await cleanup()


def get_workers(global_state: GlobalState, mcp_clients: Dict[str, MCPClient]) -> Dict[str, Worker]:
    return {
        # 'adder': Worker(llm_model='deepseek-r1-250120', name='adder', instruction='会计算两位数的加法',
        #                 tools=[add]),
        # 'comparer': Worker(llm_model='deepseek-r1-250120', name='comparer',
        #                    instruction='能够比较两个数字的大小并找到最大的那个',
        #                    tools=[compare]),
        'web_searcher': Worker(
            llm_model='deepseek-r1-250120', name='web_searcher',
            instruction='联网查询资料内容',
            tools=[
                mcp_clients.get('web_search')
            ],
            post_tool_call_hooks=[WebSearchPostToolCallHook(global_state=global_state)]
        ),
        'link_reader': Worker(
            llm_model='deepseek-r1-250120', name='link_reader',
            instruction='读取指定url链接的内容（网页/文件）',
            tools=[
                mcp_clients.get('link_reader')
            ]
        ),
        'python_executor': Worker(
            llm_model='deepseek-r1-250120', name='python_executor',
            instruction='运行指定的python代码并获取结果',
            tools=[
                mcp_clients.get('python_executor')
            ],
            post_tool_call_hooks=[PythonExecutorPostToolCallHook()]
        ),
    }


if __name__ == "__main__":
    asyncio.run(main(session_id="test-kuolao-1"))

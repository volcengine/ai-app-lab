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
import os
import uuid
from typing import AsyncIterable, Tuple, Callable, Dict, AsyncIterator, Any

from agent.worker import Worker
from arkitect.core.component.tool import MCPClient
from arkitect.core.component.tool.builder import build_mcp_clients_from_config
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.logger import INFO, ERROR
from arkitect.telemetry.trace import task, TraceConfig
from arkitect.utils.context import get_reqid
from config.config import MCP_CONFIG_FILE_PATH, SESSION_SAVE_PATH
from deep_research.deep_research import DeepResearch
from models.events import BaseEvent, InternalServiceError, InvalidParameter
from models.request import CreateSessionRequest, RunSessionRequest, DeepResearchRequest
from state.deep_research_state import DeepResearchStateManager, DeepResearchState
from state.file_state_manager import FileStateManager
from state.global_state import GlobalState
from tools.hooks import PythonExecutorPostToolCallHook, SearcherPostToolCallHook


async def _run_deep_research(
        state_manager: DeepResearchStateManager,
) -> AsyncIterable[BaseEvent]:
    # init mcp client
    mcp_clients, clean_up = build_mcp_clients_from_config(
        config_file=MCP_CONFIG_FILE_PATH,
    )

    dr_state = await state_manager.load()

    try:
        dr = DeepResearch(
            default_llm_model='deepseek-r1-250120',
            workers=get_workers(GlobalState(custom_state=dr_state), mcp_clients),
            dynamic_planning=False,
            max_planning_items=5,
            state_manager=state_manager,
        )

        async for event in dr.astream(
                dr_state=dr_state,
        ):
            yield event
    except BaseException as e:
        ERROR(str(e))
    finally:
        await clean_up()


@task()
async def create_session(request: DeepResearchRequest) -> str:
    dr_state = DeepResearchState(
        root_task=request.root_task,
    )
    session_id = uuid.uuid4().hex

    await FileStateManager(path=f"{SESSION_SAVE_PATH}/{session_id}.json").dump(
        dr_state
    )

    return session_id


async def run_session(session_id: str) -> AsyncIterable[BaseEvent]:
    state_manager = FileStateManager(path=f"{SESSION_SAVE_PATH}/{session_id}.json")

    try:
        async for event in _run_deep_research(
                state_manager=state_manager,
        ):
            event.session_id = session_id
            event.id = get_reqid()
            yield event
    except Exception as e:
        ERROR(str(e))
        yield InternalServiceError()


def get_workers(global_state: GlobalState, mcp_clients: Dict[str, MCPClient]) -> Dict[str, Worker]:
    return {
        'searcher': Worker(
            llm_model='deepseek-r1-250120', name='searcher',
            instruction='联网搜索公域资料，读取网页内容',
            tools=[
                mcp_clients.get('search')
            ],
            post_tool_call_hook=SearcherPostToolCallHook(global_state=global_state)
        ),
        'coder': Worker(
            llm_model='deepseek-r1-250120', name='coder',
            instruction='编写和运行python代码',
            tools=[
                mcp_clients.get('code')
            ],
            post_tool_call_hook=PythonExecutorPostToolCallHook()
        ),
    }


@task()
async def main(
        request: DeepResearchRequest
) -> AsyncIterable[BaseEvent]:
    if not request.session_id and not request.root_task:
        yield InvalidParameter(parameter="root_task")
        return
    # create session
    if not request.session_id and request.root_task:
        session_id = await create_session(request)
        request.session_id = session_id
        INFO(f"no previous session, created new session {session_id}")
    # run with session id
    if request.session_id:
        session_id = request.session_id
        INFO(f"start run session {session_id}")
        async for event in run_session(session_id):
            yield event


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="server.server",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/response",
        trace_on=True,
        trace_config=TraceConfig(),
        clients={},
    )

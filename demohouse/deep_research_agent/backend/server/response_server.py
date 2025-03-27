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
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterable, Tuple, Callable, Dict, AsyncIterator, Any

import uvicorn
import asyncio
from starlette.middleware.cors import CORSMiddleware

from agent.worker import Worker
from arkitect.core.component.bot.middleware import ListenDisconnectionMiddleware, LogIdMiddleware
from arkitect.core.component.tool import MCPClient
from arkitect.core.component.tool.builder import spawn_mcp_server_from_config, build_mcp_clients_from_config
from arkitect.telemetry.logger import INFO, ERROR

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from config.config import MCP_CONFIG_FILE_PATH
from deep_research.deep_research import DeepResearch
from models.events import BaseEvent, InternalServiceError
from models.server import CreateSessionRequest, RunSessionRequest
from state.deep_research_state import DeepResearchStateManager, DeepResearchState
from state.file_state_manager import FileStateManager
from state.global_state import GlobalState
from tools.hooks import WebSearchPostToolCallHook, PythonExecutorPostToolCallHook, LinkReaderPostToolCallHook
from utils.converter import convert_event_to_sse_response

SESSION_PATH = "/tmp/deep_research_session"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[Dict[str, Any]]:
    # start up mcp servers
    await spawn_mcp_server_from_config(config_file=MCP_CONFIG_FILE_PATH)
    # wait for start up
    await asyncio.sleep(10)
    # init mcp clients
    mcp_clients, clean_up = build_mcp_clients_from_config(
        config_file=MCP_CONFIG_FILE_PATH,
    )

    app.state.mcp_clients = mcp_clients

    yield

    # cleanup when shutdown
    await clean_up()


app = FastAPI(lifespan=lifespan)
app.add_middleware(ListenDisconnectionMiddleware)
app.add_middleware(LogIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _run_deep_research(
        state_manager: DeepResearchStateManager,
) -> AsyncIterable[BaseEvent]:
    dr_state = await state_manager.load()

    dr = DeepResearch(
        default_llm_model='deepseek-r1-250120',
        workers=get_workers(GlobalState(custom_state=dr_state), app.state.mcp_clients),
        reasoning_accept=False,
        max_planning_items=5,
        state_manager=state_manager,
    )

    async for event in dr.astream(
            dr_state=dr_state,
    ):
        yield event


@app.post("/session/create")
async def create_session(request: CreateSessionRequest) -> dict:
    dr_state = DeepResearchState(
        root_task=request.task,
    )
    session_id = uuid.uuid4().hex

    try:
        await FileStateManager(path=f"{SESSION_PATH}/{session_id}.json").dump(
            dr_state
        )
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
        }

    return {
        'success': True,
        'session_id': session_id,
    }


@app.post("/session/run")
async def stream_response(request: RunSessionRequest):
    state_manager = FileStateManager(path=f"{SESSION_PATH}/{request.session_id}.json")

    async def event_generator() -> AsyncIterable[str]:
        try:
            async for event in _run_deep_research(
                    state_manager=state_manager,
            ):
                yield convert_event_to_sse_response(event)
        except Exception as e:
            ERROR(str(e))
            yield InternalServiceError()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


def get_workers(global_state: GlobalState, mcp_clients: Dict[str, MCPClient]) -> Dict[str, Worker]:
    return {
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
            ],
            post_tool_call_hooks=[LinkReaderPostToolCallHook()]
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
    uvicorn.run(
        app="server.response_server:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
    )

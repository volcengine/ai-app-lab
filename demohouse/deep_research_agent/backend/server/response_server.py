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
from typing import AsyncIterable

import uvicorn
from starlette.middleware.cors import CORSMiddleware

from agent.worker import Worker
from arkitect.core.component.bot.middleware import ListenDisconnectionMiddleware, LogIdMiddleware
from arkitect.telemetry.logger import INFO, ERROR

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from deep_research.deep_research import DeepResearch
from models.events import BaseEvent, InternalServiceError
from models.server import CreateSessionRequest, RunSessionRequest
from state.deep_research_state import DeepResearchStateManager, DeepResearchState
from state.file_state_manager import FileStateManager
from utils.converter import convert_event_to_sse_response
from tools.mock import add, compare

SESSION_PATH = "/tmp/deep_research_session"

WORKERS = {
    'adder': Worker(
        llm_model='deepseek-r1-250120',
        name='adder',
        instruction='会计算两位数的加法',
        tools=[add],
    ),
    'comparer': Worker(
        llm_model='deepseek-r1-250120',
        name='comparer',
        instruction='能够比较两个数字的大小并找到最大的那个',
        tools=[compare],
    )
}

app = FastAPI()
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
        state_manager: DeepResearchStateManager
) -> AsyncIterable[BaseEvent]:
    dr_state = await state_manager.load()

    dr = DeepResearch(
        default_llm_model='deepseek-r1-250120',
        workers=WORKERS,
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


if __name__ == "__main__":
    uvicorn.run(
        app="server.response_server:app",
        host="0.0.0.0",
        port=8000,
        workers=1
    )

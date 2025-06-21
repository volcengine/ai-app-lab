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
from arkitect.core.errors import (
    ResourceNotFound,
    InternalServiceError,
    InvalidParameter,
    MissingParameter,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.logger import INFO, ERROR
from arkitect.telemetry.trace import task, TraceConfig
from arkitect.utils.context import get_reqid
from config.config import (
    MCP_CONFIG_FILE_PATH,
    SESSION_SAVE_PATH,
    WORKER_LLM_MODEL,
    SUPERVISOR_LLM_MODEL,
    SUMMARY_LLM_MODEL,
    COLLECTION_DESCRIPTION,
)
from deep_search.deep_search import DeepSearch
from models.events import BaseEvent, ErrorEvent
from models.request import CreateSessionRequest, RunSessionRequest, DeepResearchRequest
from state.deep_search_state import DeepSearchStateManager, DeepSearchState
from state.file_state_manager import FileStateManager
from state.global_state import GlobalState
from tools.hooks import (
    PythonExecutorPostToolCallHook,
    SearcherPostToolCallHook,
    KnowledgeBasePostToolCallHook,
    TLSPostToolCallHook,
)


async def _run_deep_research(
    state_manager: DeepSearchStateManager, max_plannings: int
) -> AsyncIterable[BaseEvent]:
    # init mcp client
    mcp_clients, clean_up = build_mcp_clients_from_config(
        config_file=MCP_CONFIG_FILE_PATH,
    )

    dr_state = await state_manager.load()

    if not dr_state:
        yield ErrorEvent(
            api_exception=ResourceNotFound(
                resource_type="session",
            )
        )
        return

    try:
        dr = DeepSearch(
            supervisor_llm_model=SUPERVISOR_LLM_MODEL,
            summary_llm_model=SUMMARY_LLM_MODEL,
            workers=get_workers(GlobalState(custom_state=dr_state), mcp_clients),
            dynamic_planning=False,
            max_planning_items=max_plannings,
            state_manager=state_manager,
        )

        async for event in dr.astream(
            dr_state=dr_state,
        ):
            yield event
    except BaseException as e:
        ERROR(str(e))
        yield ErrorEvent(api_exception=InternalServiceError(message=str(e)))
    finally:
        await clean_up()


# @task()
async def create_session(request: DeepResearchRequest) -> str:
    session_id = uuid.uuid4().hex

    dr_state = DeepSearchState(
        root_task=request.root_task,
        session_id=session_id,
        enabled_mcp_servers=request.enabled_mcp_servers,
    )

    await FileStateManager(path=f"{SESSION_SAVE_PATH}/{session_id}.json").dump(dr_state)

    return session_id


# @task()
async def run_session(session_id: str, max_plannings: int) -> AsyncIterable[BaseEvent]:
    state_manager = FileStateManager(path=f"{SESSION_SAVE_PATH}/{session_id}.json")

    try:
        async for event in _run_deep_research(
            state_manager=state_manager,
            max_plannings=max_plannings,
        ):
            event.session_id = session_id
            event.id = get_reqid()
            yield event
    except Exception as e:
        ERROR(str(e))
        yield ErrorEvent(api_exception=InternalServiceError(message=str(e)))


@task()
def get_workers(
    global_state: GlobalState, mcp_clients: Dict[str, MCPClient]
) -> Dict[str, Worker]:
    workers = {}

    searcher = Worker(
        llm_model=WORKER_LLM_MODEL,
        name="searcher",
        instruction="1. 联网搜索公域资料 2. 读取网页或链接内容（需要提供以`https://`开头的完整URL）",
        tools=[mcp_clients.get("search")],
        post_tool_call_hook=SearcherPostToolCallHook(global_state=global_state),
    )

    coder = Worker(
        llm_model=WORKER_LLM_MODEL, name='coder',
        instruction="""代码生成与执行单元，提供了在一个沙盒环境中，生成并执行Python代码的能力。应当作为兜底能力使用，当且仅当其他能力无法满足任务要求、且任务可以通过代码实现时，使用此单元。当代码中包含生成一个html文件时，调用run_code的fetch_files参数必须为包含该html文件名的列表。调用时，tool_arguments必须是一个为一个合法的json字符串。
            """,
        tools=[mcp_clients.get('code')],
        post_tool_call_hook=PythonExecutorPostToolCallHook()
    )

    log_retriever = Worker(
        llm_model=WORKER_LLM_MODEL,
        name="log_retriever",
        instruction="查询日志信息",
        tools=[mcp_clients.get("tls")],
        post_tool_call_hook=TLSPostToolCallHook(),
    )

    knowledgebase_retriever = Worker(
        llm_model=WORKER_LLM_MODEL,
        name="knowledgebase_retriever",
        instruction=f"查询私域知识库信息，该知识库中包含的内容：{COLLECTION_DESCRIPTION}",
        tools=[mcp_clients.get("knowledgebase")],
        post_tool_call_hook=KnowledgeBasePostToolCallHook(global_state=global_state),
    )

    ppt_generator = Worker(
        llm_model=WORKER_LLM_MODEL,
        name="ppt_generator",
        instruction="PPT编辑单元。提供了基于自然语言表述，创建、预览、和编辑PPT的能力，其中，预览和编辑均以独立链接的方式实现。当用户希望执行ppt相关操作时，使用此单元。只有在query_ppt返回的status为2时，才能进行下一步editor_ppt和download_ppt操作，否则轮训query_ppt获取当前状态。",
        tools=[mcp_clients.get("ppt")]
    )

    browser_user = Worker(
        llm_model=WORKER_LLM_MODEL,
        name="browser_user",
        instruction="""浏览器控制单元，提供了基于自然语言表述，完成指定浏览器任务的能力。当用户希望完成与某第三方（web）应用交互、或是执行其他基于web的操作时，使用此单元。使用该单元时需要注意：
    1. 当分配给该单元的任务发送邮件相关时，请按照以下格式创建浏览器任务：
    登录xxx邮箱，发送邮件。
    收件人：yyy@zzz.com
    主题：[主题]
    正文：[正文]

    2. 当分配给该单元的任务需要获取前面任务的总结或结果时，你需要将完整的结果（比如某个任务生成的完整报告，某个任务生产的完整链接）加入到创建浏览器任务的文本中。""",
        tools=[mcp_clients.get("browser")]
    )

    llm_generator = Worker(
        llm_model=WORKER_LLM_MODEL,
        name="llm_generator",
        instruction="文本生成单元。提供了向用户呈现文本形式结果的能力。当你需要输出最终结果、撰写报告、或是汇报任务进展时，使用此工具。",
    )

    if global_state.custom_state.enabled_mcp_servers:
        # add dynamic mask
        if (
            "web_search" in global_state.custom_state.enabled_mcp_servers
            or "link_reader" in global_state.custom_state.enabled_mcp_servers
        ):
            workers.update({"searcher": searcher})
        if 'code' in global_state.custom_state.enabled_mcp_servers:
            workers.update({'coder': coder})
        if "tls" in global_state.custom_state.enabled_mcp_servers:
            workers.update({"log_retriever": log_retriever})
        if "knowledgebase" in global_state.custom_state.enabled_mcp_servers:
            workers.update({"knowledgebase_retriever": knowledgebase_retriever})
        if "browser_use" in global_state.custom_state.enabled_mcp_servers:
            workers.update({"browser_user": browser_user})
        if "chatppt" in global_state.custom_state.enabled_mcp_servers:
            workers.update({"ppt_generator": ppt_generator})
        workers.update({"llm_generator": llm_generator})

        return workers
    else:
        # no mask
        return {
            "searcher": searcher,
            # 'coder': coder,
            "log_retriever": log_retriever,
            "knowledgebase_retriever": knowledgebase_retriever,
        }


# @task()
async def event_handler(request: DeepResearchRequest) -> AsyncIterable[BaseEvent]:
    if not request.stream:
        yield ErrorEvent(
            api_exception=InvalidParameter(
                parameter="stream", cause="request.stream should be true"
            )
        )
    if not request.session_id and not request.root_task:
        yield ErrorEvent(api_exception=MissingParameter(parameter="root_task"))
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
        async for event in run_session(session_id, request.max_plannings):
            yield event


async def main(request: DeepResearchRequest) -> AsyncIterable[BaseEvent]:
    async for event in event_handler(request):
        yield event


# this will run server in raw-event mode
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

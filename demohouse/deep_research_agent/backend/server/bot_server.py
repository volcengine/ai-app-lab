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
from typing import AsyncIterable, List, Dict

from arkitect.core.errors import MissingParameter
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task, TraceConfig
from arkitect.types.llm.model import ArkChatRequest, ArkChatCompletionChunk
from models.request import DeepResearchRequest

from server.server import event_handler
from utils.message import get_last_message
from utils.converter import convert_event_to_bot_chunk


def extract_enabled_mcp_servers(mcp_servers: Dict[str, Dict]) -> List[str]:
    enabled = []
    for k, v in mcp_servers.items():
        if not v.get("disable", False):
            enabled.append(k)
    return enabled


@task(trace_all=False)
async def main(
        request: ArkChatRequest,
) -> AsyncIterable[ArkChatCompletionChunk]:
    query = get_last_message(request.messages, "user")
    session_id = (request.metadata or {}).get("session_id", "")
    enabled_mcp_servers = []
    mcp_servers = (request.metadata or {}).get("mcp_servers", {})
    max_plannings = (request.metadata or {}).get("max_plannings", 5)
    if mcp_servers:
        enabled_mcp_servers = extract_enabled_mcp_servers(mcp_servers)

    if not query and not session_id:
        raise MissingParameter(parameter="messages")

    async for event in event_handler(
            request=DeepResearchRequest(
                stream=request.stream,
                root_task=query.content,
                session_id=session_id,
                enabled_mcp_servers=enabled_mcp_servers,
                max_plannings=max_plannings,
            )
    ):
        yield convert_event_to_bot_chunk(event, request)


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="server.bot_server",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        trace_on=True,
        trace_config=TraceConfig(),
        clients={},
    )

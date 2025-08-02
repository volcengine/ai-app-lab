# -*- coding: UTF-8 -*-
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

"""
默认llm逻辑
"""
import os
from typing import AsyncIterable

from arkitect.core.errors import APIException
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatRequest
from arkitect.types.runtime.model import Response
from arkitect.utils.context import get_headers
from throttled import MemoryStore

import env
from actions.dispatcher import ActionDispatcher


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    dispatcher = ActionDispatcher()
    # 通过使用不同的 header 分发到不同的处理逻辑
    request_action = get_headers().get("request-action", "default")
    request_web_access_password = get_headers().get("request-web-access-password", None)
    if (
        env.WEB_ACCESS_PASSWORD
        and request_web_access_password != env.WEB_ACCESS_PASSWORD
    ):
        raise APIException(
            message="Unauthorized: Invalid or missing web-access-token. "
            "Please provide a valid token in the request headers.",
            code="401",
            http_code=401,
        )

    async for response in dispatcher.dispatch(request_action, request):
        yield response


store: MemoryStore()

if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8080,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={},
    )

# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
from typing import Any, Dict, Optional, Tuple, Type

from arkitect.core.client import Client
from arkitect.core.component.bot import BotServer
from arkitect.core.runtime import load_function
from arkitect.telemetry.trace import TraceConfig, setup_tracing
from arkitect.utils.context import set_account_id, set_resource_id, set_resource_type

from ..runner import get_default_client_configs, get_endpoint_config, get_runner


def launch_serve(
    package_path: str,
    host: str = "0.0.0.0",
    port: int = 8080,
    endpoint_path: str = "/api/v3/bots/chat/completions",
    health_check_path: Optional[str] = "/healthz",
    clients: Optional[Dict[str, Tuple[Type[Client], Any]]] = None,
    trace_config: Optional[TraceConfig] = None,
    trace_on: bool = True,
    trace_log_dir: Optional[str] = "./",
    **kwargs: Any,
) -> None:
    set_resource_type(os.getenv("RESOURCE_TYPE") or "")
    set_resource_id(os.getenv("RESOURCE_ID") or "")
    set_account_id(os.getenv("ACCOUNT_ID") or "")

    setup_tracing(
        endpoint=os.getenv("TRACE_ENDPOINT"),
        trace_config=trace_config,
        trace_on=trace_on,
        log_dir=trace_log_dir,
    )

    runnable_func = load_function(package_path, "main")

    server: BotServer = BotServer(
        runner=get_runner(runnable_func),
        health_check_path=health_check_path,
        endpoint_config=get_endpoint_config(endpoint_path, runnable_func),
        clients=clients if clients else get_default_client_configs(),
    )
    server.run(app=server.app, host=host, port=port, **kwargs)

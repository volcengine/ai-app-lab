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

from arkitect.core.client import Client, get_client_pool
from arkitect.telemetry.trace import TraceConfig, setup_tracing
from arkitect.utils.context import (
    set_account_id,
    set_resource_id,
    set_resource_type,
)

from ..runner import get_default_client_configs


def setup_environment(
    trace_on: bool = True, trace_config: Optional[TraceConfig] = None
) -> None:
    set_resource_type(os.getenv("RESOURCE_TYPE") or "")
    set_resource_id(os.getenv("RESOURCE_ID") or "")
    set_account_id(os.getenv("ACCOUNT_ID") or "")

    setup_tracing(
        endpoint=os.getenv("TRACE_ENDPOINT"),
        trace_on=trace_on,
        trace_config=trace_config,
    )


def initialize(
    context: Any,
    clients: Optional[Dict[str, Tuple[Type[Client], Any]]] = None,
    trace_on: bool = True,
    trace_config: Optional[TraceConfig] = None,
) -> None:
    get_client_pool(clients or get_default_client_configs())

    setup_environment(trace_on, trace_config)
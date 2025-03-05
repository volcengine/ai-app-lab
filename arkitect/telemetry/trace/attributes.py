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
from typing import Any, Dict, Optional

from opentelemetry import trace
from opentelemetry.trace.span import Span
from opentelemetry.trace.status import StatusCode

from arkitect.utils import dump_json_str_truncate
from arkitect.utils.context import get_custom_attributes

_TRACE_MAX_STRING_LEN = os.environ.get("TRACE_MAX_STRING_LEN", "10000")


def set_trace_attributes(
    span: Span,
    *,
    status_code: trace.StatusCode = StatusCode.UNSET,
    resource_type: str = "",
    resource_id: str = "",
    request_id: str = "",
    client_request_id: str = "",
    account_id: str = "",
    input: Any = None,
    output: Any = None,
    merge_output: Optional[bool] = None,
    custom_attributes: Optional[Dict[str, Any]] = None,
) -> None:
    span.set_attribute(
        "input", dump_json_str_truncate(input, int(_TRACE_MAX_STRING_LEN))
    )
    span.set_attribute(
        "output", dump_json_str_truncate(output, int(_TRACE_MAX_STRING_LEN))
    )
    span.set_attribute("request_id", request_id)
    span.set_attribute("client_request_id", client_request_id)
    span.set_attribute("resource_type", resource_type)
    span.set_attribute("resource_id", resource_id)
    span.set_attribute("account_id", account_id)
    span.set_attribute("merge_output", merge_output or False)
    span.set_status(trace.Status(status_code, ""))

    if custom_attributes is None:
        custom_attributes = get_custom_attributes()
    if custom_attributes:
        for k, v in custom_attributes.items():
            span.set_attribute(k, dump_json_str_truncate(v, int(_TRACE_MAX_STRING_LEN)))

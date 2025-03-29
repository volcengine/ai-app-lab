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

import contextvars
import os
import time
from typing import Any, Dict, Optional

from starlette.datastructures import Headers

_headers: contextvars.ContextVar[Headers] = contextvars.ContextVar("_headers")


def set_headers(val: Headers) -> None:
    _headers.set(val)


def get_headers(default_val: Headers = Headers()) -> Headers:
    return _headers.get(default_val)


_resource_id: contextvars.ContextVar[str] = contextvars.ContextVar("_resource_id")


def set_resource_id(val: str = "") -> None:
    _resource_id.set(val)


def get_resource_id(default_val: str = "") -> str:
    return _resource_id.get(default_val)


_resource_type: contextvars.ContextVar[str] = contextvars.ContextVar("_resource_type")


def set_resource_type(val: str = "") -> None:
    _resource_type.set(val)


def get_resource_type(default_val: str = "") -> str:
    return _resource_type.get(default_val)


_reqid: contextvars.ContextVar[str] = contextvars.ContextVar("_reqid")


def set_reqid(val: str = "") -> None:
    _reqid.set(val)


def get_reqid(default_val: str = "") -> str:
    return _reqid.get(default_val)


_client_reqid: contextvars.ContextVar = contextvars.ContextVar("_client_reqid")


def set_client_reqid(val: str) -> None:
    _client_reqid.set(val)


def get_client_reqid(default_val: str = "") -> str:
    return _client_reqid.get(default_val)


_start_time: contextvars.ContextVar[float] = contextvars.ContextVar("_start_time")


def set_start_time(start_time: float) -> None:
    _start_time.set(start_time)


def get_start_time() -> float:
    return _start_time.get(time.time())


_account_id: contextvars.ContextVar[str] = contextvars.ContextVar("_account_id")


def set_account_id(val: str = "") -> None:
    _account_id.set(val)


def get_account_id(default_val: str = "") -> str:
    return _account_id.get(default_val)


_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("_user_id")


def set_user_id(val: str = "") -> None:
    _user_id.set(val)


def get_user_id(default_val: str = "") -> str:
    return _user_id.get(default_val)


_custom_attributes: contextvars.ContextVar[Optional[Dict[str, Any]]] = (
    contextvars.ContextVar("_custom_attributes")
)


def set_custom_attributes(val: Dict[str, Any]) -> None:
    _custom_attributes.set(val)


def get_custom_attributes() -> Optional[Dict[str, Any]]:
    return _custom_attributes.get(None)


_req_source_type: contextvars.ContextVar[str] = contextvars.ContextVar(
    "_req_source_type"
)


def set_req_source_type(val: str = "") -> None:
    _req_source_type.set(val)


def get_req_source_type(default_val: str = "") -> str:
    return _req_source_type.get(default_val)


HEADERS_WHITE_LIST = {
    "authorization": "Authorization",
    "x-account-id": "X-Account-Id",
    "x-user-id": "X-User-Id",
    "x-project-name": "X-Project-Name",
}


def get_extra_headers(extra_headers: Optional[Dict[str, str]] = {}) -> Dict[str, str]:
    if not extra_headers:
        extra_headers = {}
    if os.getenv("EXPOSE_HEADERS") == "true":
        headers = get_headers()
        for header in headers.keys():
            if header.lower() in HEADERS_WHITE_LIST:
                extra_headers[HEADERS_WHITE_LIST[header.lower()]] = headers[header]

    extra_headers["X-Tt-Logid"] = get_reqid()
    extra_headers["X-Request-Id"] = get_reqid()
    extra_headers["X-Client-Request-Id"] = get_client_reqid()
    extra_headers["Ark-Origin-Service-Type"] = "bot-procode"
    extra_headers["Ark-Origin-Service-Id"] = get_resource_id()
    # for procode difference
    extra_headers["Ark-Origin-Request-Id"] = get_reqid()
    return extra_headers

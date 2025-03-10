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

from typing import Optional, TypeVar, Union

from pydantic import BaseModel

from arkitect.core.errors import ArkError, Error


class Request(BaseModel):
    stream: bool = False


class Response(BaseModel):
    error: Optional[Union[Error, ArkError]] = None


RequestType = TypeVar("RequestType", bound=Request, contravariant=True)
ResponseType = TypeVar("ResponseType", bound=Response, covariant=True)


class Context(BaseModel):
    request_id: str = ""
    client_request_id: str = ""
    account_id: str = ""
    resource_id: str = ""
    resource_type: str = ""

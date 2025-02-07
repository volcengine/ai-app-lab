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

from typing import Any, Dict, Optional

from pydantic import BaseModel


class BaseToolRequest(BaseModel):
    """ """

    tool_name: str

    parameters: Optional[Dict[str, Any]] = None


class BaseToolResponse(BaseModel):
    data: Optional[Any] = None


class ArkToolRequest(BaseToolRequest):
    """ """

    action_name: str

    dry_run: Optional[bool] = False
    timeout: Optional[int] = 60


class ArkToolResponse(BaseToolResponse):
    status_code: Optional[int] = None


class CustomToolResponse(BaseToolResponse):
    pass

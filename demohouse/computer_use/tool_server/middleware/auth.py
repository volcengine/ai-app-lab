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

import logging

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from common.config import get_settings
from services.router import BaseResponse, ResponseMetadataModel

logger = logging.getLogger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next) -> Response:
        auth_header = request.headers.get("X-API-Key")
        if not auth_header:
            auth_header = request.headers.get("Authorization")
        request_id = request.headers.get("X-Request-ID", "")
        action = request.query_params.get("Action", "")
        version = request.query_params.get("Version", "")

        if not auth_header or auth_header != get_settings().auth_key:
            error_response = BaseResponse(
                ResponseMetadata=ResponseMetadataModel(
                    RequestId=request_id,
                    Action=action,
                    Version=version,
                    Service="tool_server",
                    Region="",
                ),
                Result={"Error": "Permission denied"},
            )
            return JSONResponse(
                status_code=401,
                content=error_response.model_dump(),
            )

        return await call_next(request)
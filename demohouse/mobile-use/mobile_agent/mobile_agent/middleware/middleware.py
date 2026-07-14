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
响应中间件 - 统一处理API返回格式
"""

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Dict, Any, Union
import json
import logging
from mobile_agent.exception.api import APIException

logger = logging.getLogger(__name__)


class ResponseMiddleware(BaseHTTPMiddleware):
    """
    响应中间件，统一处理成功和失败的返回格式

    成功格式：
    {
        "result": {...}
    }

    失败格式：
    {
        "error": {
            "code": xxx,
            "message": "错误信息"
        }
    }
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            # 调用下一个中间件或路由处理函数
            response = await call_next(request)

            # 如果是流式响应或其他非JSON响应，直接返回
            if not isinstance(response, JSONResponse):
                return response

            # 获取原始响应数据
            response_body = json.loads(response.body.decode())

            # 如果响应已经是格式化后的数据，直接返回
            if isinstance(response_body, dict) and (
                "result" in response_body or "error" in response_body
            ):
                return response

            # 包装成功响应
            return JSONResponse(
                content=wrap_response_data(response_body),
                status_code=response.status_code,
                headers=dict(response.headers),
            )

        except APIException as api_error:
            # 处理自定义API异常
            logger.warning(f"业务报错: {api_error}")

            return JSONResponse(
                content=wrap_error_response(api_error.code, api_error.message),
                status_code=200,
                media_type="application/json",
            )

        except Exception as e:
            # 记录未知异常
            logger.exception(f"请求处理异常: {e}")

            # 包装错误响应
            return JSONResponse(
                content=wrap_error_response(500, f"服务器内部错误: {str(e)}"),
                status_code=500,
                media_type="application/json",
            )


def wrap_response_data(data: Any) -> Dict[str, Any]:
    """
    包装正常返回的数据

    Args:
        data: 要返回的数据

    Returns:
        Dict: 格式化后的响应数据
    """
    return {"result": data, "error": {"code": 0, "message": "success"}}


def wrap_error_response(
    code: int, message: str
) -> Dict[str, Dict[str, Union[int, str]]]:
    """
    包装错误返回的数据

    Args:
        code: 错误码
        message: 错误信息

    Returns:
        Dict: 格式化后的错误响应数据
    """
    return {"error": {"code": code, "message": message}}

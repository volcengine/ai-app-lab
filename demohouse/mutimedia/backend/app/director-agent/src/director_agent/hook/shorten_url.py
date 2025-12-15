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
from typing import Optional, Any

import requests
from google.adk.tools import BaseTool, ToolContext
from veadk.utils.logger import get_logger

logger = get_logger(__name__)

shorten_url_service_url = os.getenv("SHORTEN_URL_SERVICE_URL", None)


def shorten_url_impl(url: str, resource_type: Optional[str] = "resource") -> str:
    """
    Shorten the URL using the TinyURL API.
    """
    data = {"url": url, "type": resource_type}
    # 发送 POST 请求

    shorten_url = shorten_url_service_url + r"/shorten"
    response = requests.post(shorten_url, json=data)
    if response.status_code == 200:
        response_data = response.json()
        short_url = response_data.get("short_url")
        return short_url
    else:
        logger.error(f"Failed to shorten URL: {response.status_code}")
        return url


def hook_shorten_url(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: Any
) -> Optional[Any]:
    """
    Shorten the URL from the LLM response.
    """
    if shorten_url_service_url is None:
        logger.warning("SHORTEN_URL_SERVICE_URL is not set, skipping shorten_url hook")
        return None

    tool_name = tool.name
    if tool_name == "image_generate":
        success_list = tool_response["success_list"]
        for data in success_list:
            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, str):
                        value = shorten_url_impl(url=value, resource_type="image")
                        data[key] = value
        logger.debug(f"Shorten URL of `image_generate` successfully: {success_list}")
        return tool_response
    elif tool_name == "video_generate":
        success_list = tool_response["success_list"]
        for data in success_list:
            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, str):
                        value = shorten_url_impl(url=value, resource_type="video")
                        data[key] = value
        logger.debug(f"Shorten URL of `video_generate` successfully: {success_list}")
        return tool_response
    return None

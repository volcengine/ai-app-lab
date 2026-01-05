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

import asyncio
import json
import os
from typing import List, Dict, Any
from typing import Optional
import urllib.parse
import aiohttp
import fastmcp
from fastmcp import Client
from veadk.utils.logger import get_logger

logger = get_logger(__name__)

# 短链接服务配置
shorten_url_service_url = os.getenv("SHORTEN_URL_SERVICE_URL", None)
assert shorten_url_service_url, "SHORTEN_URL_SERVICE_URL is not set"


async def resolve_short_url(short_url: str) -> str:
    """
    将短链接还原为原始URL

    Args:
        short_url: 短链接URL

    Returns:
        原始URL，如果解析失败则返回短链接本身
    """
    # 避免在控制台打印短链接，改用结构化日志
    logger.debug("Resolving short URL")
    if not shorten_url_service_url:
        return short_url

    try:
        # 从短链接中提取短码
        # 短链接格式: http://127.0.0.1:8005/t/AbC123 或 http://127.0.0.1:8005/t/video/AbC123
        parsed_url = urllib.parse.urlparse(short_url)
        path_parts = parsed_url.path.strip("/").split("/")

        if len(path_parts) >= 2 and path_parts[0] == "t":
            # 调用短链接服务的重定向接口来获取原始URL
            async with aiohttp.ClientSession() as session:
                # 使用GET请求获取原始URL（短链接服务直接返回原始URL字符串）
                async with session.get(short_url) as response:
                    if response.status == 200:
                        # 短链接服务直接返回原始URL字符串
                        original_url = await response.text()
                        original_url = original_url.strip().strip('"')
                        logger.debug(
                            f"Successfully resolved short URL: {short_url} -> {original_url}"
                        )
                        return original_url
                    else:
                        logger.warning(
                            f"Failed to resolve short URL: {short_url}, status: {response.status}"
                        )
                        return short_url
        else:
            logger.warning(f"Not a valid short URL format: {short_url}")
            return short_url

    except Exception as e:
        logger.error(f"Error resolving short URL {short_url}: {e}")
        # 如果解析失败，返回原始短链接
        return short_url

vod_mcp_config = {
    "mcpServers": {
        "mcp-server-vod": {
            "command": "uvx",
            "args": [
                "--from",
                "git+https://github.com/volcengine/mcp-server.git#subdirectory=server/mcp_server_vod",
                "mcp-server-vod",
            ],
            "env": {
                "VOLCENGINE_ACCESS_KEY": os.getenv("VOLCENGINE_ACCESS_KEY"),
                "VOLCENGINE_SECRET_KEY": os.getenv("VOLCENGINE_SECRET_KEY"),
            },
        }
    }
}


class VodToolSet:
    def __init__(
        self,
        mcp_config: dict,
        space_name: Optional[str] = None,
        task_polling_interval: int = 20,
        max_retries: int = 30,
    ):
        self.mcp_client = Client(mcp_config)
        self.space_name = space_name
        self.task_polling_interval = task_polling_interval
        self.max_retries = max_retries

    async def list_tools(self):
        async with self.mcp_client as client:
            response = await client.list_tools()
            return response

    async def _call_tools(self, tool_name: str, arguments: dict[str, Any]):
        async with self.mcp_client as client:
            response = await client.call_tool(
                name=tool_name,
                arguments=arguments,
            )

            return [
                json.loads(content.model_dump().get("text", ""))
                for content in response.content
            ]

    async def video_stitching(self, videos_url: list[str]) -> dict:
        new_videos_url = []
        for item in videos_url:
            item = resolve_short_url(item)
            new_videos_url.append(item)

        response = await self._call_tools(
            tool_name="audio_video_stitching",
            arguments={
                "type": "video",
                "SpaceName": self.space_name,
                "videos": new_videos_url,
            },
        )

        task_id = response[0]["VCreativeId"]

        for _ in range(self.max_retries):
            response = await self._get_task_message(task_id)
            status = response.get("Status", "error")
            if status in {"success", "failed_run"}:
                break
            elif status == "error":
                return {
                    "film_url": "",
                    "success": False,
                    "message": "视频合成工具繁忙，请重试",
                }
            else:
                await asyncio.sleep(self.task_polling_interval)
        else:
            return {"url": "", "status": "timeout"}

        return {
            "film_url": response.get("OutputJson", {}).get("url", ""),
            "success": status == "success",
            "message": status,
        }

    async def _get_task_message(self, task_id: str) -> dict:
        try:
            response = await self._call_tools(
                tool_name="get_v_creative_task_result",
                arguments={"VCreativeId": task_id, "SpaceName": self.space_name},
            )
            status = response[0]
            return status
        except fastmcp.exceptions.ToolError as e:
            logger.error(
                f"Error getting task message: fastmcp.exceptions.ToolError: {e}"
            )
            return {"Status": "mcp_error"}

    async def generate(self, video_list: list[dict[str, Any]]) -> dict[str, Any]:
        """
        处理视频列表：
        {
            "video": {"url": "xxx"},
            "audio": {"url": "xxx"}  # optional
        }
        """

        if not video_list:
            raise ValueError("video_list not found")

        videos: list = []

        for i, shot in enumerate(video_list, start=1):
            video_info = shot.get("video", {})
            video_url = video_info.get("url") if isinstance(video_info, dict) else None
            if not video_url:
                raise ValueError(f"shot[{i}] missing video.url")

            videos.append(video_url)

        video_product = videos
        # 第二步：这些视频合并在一起
        result = await self.video_stitching(video_product)

        logger.debug(f"[video_combine] result: {result}")
        return result



async def video_combine(video_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Tool Name:
        video_combine

    Description:
        该工具用于将多个视频片段（shots）按照给定顺序剪辑拼接为一个完整的视频。    每个视频片段包含其独立的视觉描述（prompt）、动作说明（action）以及视频文件信息。
        工具可用于自动化生成广告视频、产品展示片或创意短片。

    Args:
        video_list (List[Dict]):
            包含多个视频片段（shot）的列表，每个元素为一个字典，字段说明如下：
            - shot_id (str):
                当前镜头的唯一标识符。
            - prompt (str):
                对镜头画面的详细视觉描述，用于说明画面构图、主体、光线、氛围等信息。
            - action (str):
                对镜头运动、转场或特效的文字描述，如“镜头缓慢推进”或“伴随光晕特效”。
            - video (Dict):
                当前镜头对应的视频文件信息，包含：
                    - id (str): 视频文件在系统中的唯一标识。
                    - url (str): 视频文件的可访问 URL（例如对象存储链接）。
            - audio (Dict, optional):
                当前镜头对应的音频文件信息，包含：
                    - id (str): 音频文件在系统中的唯一标识。
                    - url (str): 音频文件的可访问 URL。

    Returns:
        output_video (str):
            拼接完成的视频文件路径或可访问 URL。

    Example:
        >>> video_list = [
        ...     {
        ...         "shot_id": "shot_1",
        ...         "prompt": "主体为望梅好杨梅汁透明玻璃瓶，瓶内红色杨梅汁清澈可见...",
        ...         "action": "镜头从全景缓慢旋转推近瓶身",
        ...         "video": {"id": "1", "url": "https://example.com/video1.mp4"},
        ...         "audio": {"id": "1", "url": "https://example.com/audio1.mp3"}
        ...     },
        ...     ...
        ... ]
        >>> result = video_combine(video_list)
        >>> print(result)
        {
            "film_url": 'https://example.com/merged_video.mp4',
            "status": "success"
        }

    Notes:
        - 所有输入视频应具有兼容的分辨率与帧率，否则需要预处理以统一参数。
        - 工具会根据 video_list 的顺序依次拼接视频。
    """
    vod_tool_set = VodToolSet(
        space_name=os.getenv("TOOLS_VOD_SPACE_NAME", None),
        task_polling_interval=int(
            os.getenv("TOOLS_VOD_TASK_POLLING_INTERVAL", "20")
        ),
        max_retries=int(os.getenv("TOOLS_VOD_MAX_RETRIES", "60")),
        mcp_config=vod_mcp_config,
    )
    try:
        film_url = await vod_tool_set.generate(video_list)

        return film_url
    except Exception as e:
        logger.error(f"Failed to generate film: {e}")
        return {
            "film_url": "",
            "success": False,
            "message": "视频合成工具执行出错，请重试",
        }
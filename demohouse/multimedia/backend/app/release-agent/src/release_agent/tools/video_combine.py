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

import urllib.parse
import os
import random
import tempfile
import uuid
from typing import List
from typing import Optional

import aiohttp
from moviepy import CompositeVideoClip, VideoFileClip
from veadk.config import veadk_environments  # noqa
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


async def video_combine(video_urls: List[str]) -> Optional[str]:
    """
    合并多个视频URL为一个视频文件

    Args:
        video_urls: 视频URL列表

    Returns:
        合并后的视频文件路径，如果合并失败则返回None
    """

    # 获取项目根目录
    current_dir = os.path.abspath(__file__)
    project_root = os.path.dirname(current_dir)
    for _ in range(4):  # 向上四级目录到达项目根目录
        project_root = os.path.dirname(project_root)

    # 创建输出目录在项目根目录下
    output_dir = os.path.join(project_root, "merged_videos")
    os.makedirs(output_dir, exist_ok=True)
    temp_dir = tempfile.mkdtemp(dir=output_dir)
    logger.info(f"Created temporary directory: {temp_dir}")

    # 解析短链接
    resolved_urls = []
    for url in video_urls:
        resolved_url = await resolve_short_url(url)
        # 仅允许 http/https 协议，降低 SSRF 风险
        parsed = urllib.parse.urlparse(resolved_url)
        if parsed.scheme not in {"http", "https"}:
            logger.warning(f"Skip non-http(s) URL: {resolved_url}")
            continue
        resolved_urls.append(resolved_url)

    # 下载视频文件
    downloaded_files = []

    async with aiohttp.ClientSession() as session:
        for idx, url in enumerate(resolved_urls):
            try:
                # 下载视频
                logger.info(
                    f"Downloading video {idx + 1}/{len(resolved_urls)} from {url}"
                )

                async with session.get(url, allow_redirects=True) as response:
                    response.raise_for_status()
                    # 预检查内容大小，防止极端大文件下载
                    content_length = response.headers.get("content-length")
                    max_file_size = 512 * 1024 * 1024  # 512MB 上限
                    if content_length is not None:
                        try:
                            if int(content_length) > max_file_size:
                                logger.error(
                                    f"Video size {int(content_length)} exceeds limit {max_file_size}."
                                )
                                return None
                        except Exception:
                            # 如果 content-length 无法解析，继续按流式大小校验
                            pass

                    # 从content-type提取文件扩展名
                    content_type = response.headers.get("content-type", "")
                    file_extension = ".mp4"  # 默认扩展名
                    if "video" in content_type:
                        if "mp4" in content_type:
                            file_extension = ".mp4"
                        elif "webm" in content_type:
                            file_extension = ".webm"
                        elif "ogg" in content_type:
                            file_extension = ".ogg"
                        elif "mov" in content_type:
                            file_extension = ".mov"

                    # 生成简单的随机文件名
                    temp_file_path = os.path.join(
                        temp_dir,
                        f"video_{random.randint(100000, 999999)}{file_extension}",
                    )

                    # 按流式传输进行大小限制（兜底）
                    max_file_size = 512 * 1024 * 1024  # 512MB
                    total_size = 0

                    with open(temp_file_path, "wb") as f:
                        async for chunk in response.content.iter_chunked(8192):
                            if chunk:
                                total_size += len(chunk)
                                if total_size > max_file_size:
                                    logger.error(
                                        "Video size exceeds 10GB. Download stopped."
                                    )
                                    return None
                                f.write(chunk)

                if (
                    os.path.exists(temp_file_path)
                    and os.path.getsize(temp_file_path) > 0
                ):
                    downloaded_files.append(temp_file_path)
                    logger.info(
                        f"Successfully downloaded video {idx + 1} to {temp_file_path}, size: {total_size / 1024 / 1024:.2f} MB"
                    )
                else:
                    logger.error(
                        f"Failed to download video {idx + 1}: file is empty or doesn't exist"
                    )
                    return None

            except Exception as e:
                logger.error(f"Error downloading video {idx + 1} from {url}: {e}")
                return None

    if not downloaded_files:
        logger.error("No videos were successfully downloaded")
        return None

    try:
        # 合并视频
        logger.info(f"Starting to merge {len(downloaded_files)} videos")

        # 加载所有视频片段
        video_clips = []
        start_times = []
        clip_start_time = 0.0

        try:
            for file_path in downloaded_files:
                # 记录每个片段的开始时间
                start_times.append(clip_start_time)

                # 加载视频片段
                clip = VideoFileClip(file_path)
                video_clips.append(clip)

                # 更新下一个片段的开始时间
                clip_start_time += clip.duration

            # 为每个视频片段设置开始时间和位置
            clips = []
            for video_clip, start_time in zip(video_clips, start_times):
                # 使用 with_start 和 with_position 方法设置片段属性
                positioned_clip = video_clip.with_start(start_time).with_position(
                    "center"
                )
                clips.append(positioned_clip)

            # 使用 CompositeVideoClip 合并所有片段
            final_clip = CompositeVideoClip(clips)

            # 生成输出文件名
            output_file_name = f"merged_video_{uuid.uuid4()}.mp4"
            output_file_path = os.path.join(temp_dir, output_file_name)

            # 保存合并后的视频
            logger.info(f"Saving merged video to {output_file_path}")
            final_clip.write_videofile(
                output_file_path, codec="libx264", audio_codec="aac", threads=4
            )
        finally:
            # 确保无论发生什么错误，都关闭所有视频片段
            for clip in video_clips:
                try:
                    if hasattr(clip, "reader") and clip.reader:
                        clip.reader.close()
                    if hasattr(clip, "audio_reader") and clip.audio_reader:
                        clip.audio_reader.close_proc()
                        clip.audio_reader.close()
                    clip.close()
                except Exception as e:
                    logger.error(f"Error closing video clip: {e}")
            if "final_clip" in locals():
                try:
                    if hasattr(final_clip, "close"):
                        final_clip.close()
                except Exception as e:
                    logger.error(f"Error closing final clip: {e}")

        if os.path.exists(output_file_path) and os.path.getsize(output_file_path) > 0:
            logger.info(f"Successfully merged video to local path: {output_file_path}")
            return output_file_path
        else:
            logger.error(
                f"Merged video file is empty or doesn't exist: {output_file_path}"
            )
            return None

    except Exception as e:
        logger.error(f"Error merging videos: {e}")
        return None

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
import traceback
from typing import Dict
import aiohttp
import urllib.parse

from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.trace import Span

from veadk.config import getenv, settings
from veadk.consts import DEFAULT_VIDEO_MODEL_API_BASE, DEFAULT_VIDEO_MODEL_NAME
from veadk.utils.logger import get_logger
from veadk.version import VERSION

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


async def generate(prompt, first_frame_image=None, last_frame_image=None):
    """
    Generate a video using HTTP requests
    """
    api_key = getenv(
        "MODEL_VIDEO_API_KEY", getenv("MODEL_AGENT_API_KEY", settings.model.api_key)
    )
    base_url = getenv("MODEL_VIDEO_API_BASE", DEFAULT_VIDEO_MODEL_API_BASE)
    model = getenv("MODEL_VIDEO_NAME", DEFAULT_VIDEO_MODEL_NAME)

    # 解析短链接为原始URL
    if first_frame_image:
        first_frame_image = await resolve_short_url(first_frame_image)
    if last_frame_image:
        last_frame_image = await resolve_short_url(last_frame_image)

    # Build the content array
    prompt_with_media = f"（可以有极其轻度的动作音，但禁止任何人声，禁止背景音乐，禁止音效，禁止旁白，禁止解说）{prompt}"
    content = [{"type": "text", "text": prompt_with_media}]

    if first_frame_image and last_frame_image:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": first_frame_image},
                "role": "first_frame",
            }
        )
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": last_frame_image},
                "role": "last_frame",
            }
        )
    elif first_frame_image:
        content.append({"type": "image_url", "image_url": {"url": first_frame_image}})

    # Build the request body
    request_body = {
        "model": model,
        "content": content,
        # "generate_audio": True,       # for seedance 1.5 pro only
        "duration": 5,
    }

    # Build headers
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "veadk-source": "veadk",
        "veadk-version": VERSION,
        "User-Agent": f"VeADK/{VERSION}",
        "X-Client-Request-Id": getenv("MODEL_AGENT_CLIENT_REQ_ID", f"veadk/{VERSION}"),
    }

    # Make the POST request
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                f"{base_url.rstrip('/')}/contents/generations/tasks",
                json=request_body,
                headers=headers,
            ) as response:
                response.raise_for_status()
                response_json = await response.json()
                return response_json
        except Exception:
            logger.error(f"Error in generate: {traceback.format_exc()}")
            raise


async def video_generate(
    params: list, tool_context: ToolContext, batch_size: int = 32
) -> Dict:
    """
    Generate videos in **batch** from text prompts, optionally guided by a first/last frame,
    and fine-tuned via *model text commands* (a.k.a. `parameters` appended to the prompt).

    This API creates video-generation tasks. Each item in `params` describes a single video.
    The function submits all items in one call and returns task metadata for tracking.

    Args:
        params (list[dict]):
            A list of video generation requests. Each item supports the fields below.
            Required per item:
                - video_name (str):
                    Name/identifier of the output video file.

                - prompt (str):
                    Text describing the video to generate. Supports zh/EN.
                    You may append **model text commands** after the prompt to control resolution,
                    aspect ratio, fps, watermark, seed, camera lock, etc.
                    Format: `... --rs <resolution> --rt <ratio> --fps <fps> --wm <bool> --seed <int> --cf <bool>`
                    Example:
                        "小猫骑着滑板穿过公园。 --rs 720p --rt 16:9 --fps 24 --wm true --seed 11 --cf false"

            Optional per item:
                - first_frame (str | None):
                    URL or Base64 string (data URL) for the **first frame** (role = `first_frame`).
                    Use when you want the clip to start from a specific image.

                - last_frame (str | None):
                    URL or Base64 string (data URL) for the **last frame** (role = `last_frame`).
                    Use when you want the clip to end on a specific image.

            Notes on first/last frame:
                * When both frames are provided, **match width/height** to avoid cropping; if they differ,
                  the tail frame may be auto-cropped to fit.
                * If you only need one guided frame, provide either `first_frame` or `last_frame` (not both).

            Image input constraints (for first/last frame):
                - Formats: jpeg, png, webp, bmp, tiff, gif
                - Aspect ratio (宽:高): 0.4–2.5
                - Width/Height (px): 300–6000
                - Size: < 30 MB
                - Base64 data URL example: `data:image/png;base64,<BASE64>`

    Model text commands (append after the prompt; unsupported keys are ignored by some models):
        --rs / --resolution <value>       Video resolution. Common values: 480p, 720p, 1080p.
                                          Default depends on model (e.g., doubao-seedance-1-0-pro: 1080p,
                                          some others default 720p).

        --rt / --ratio <value>            Aspect ratio. Typical: 16:9 (default), 9:16, 4:3, 3:4, 1:1, 2:1, 21:9.
                                          Some models support `keep_ratio` (keep source image ratio) or `adaptive`
                                          (auto choose suitable ratio).

        --fps / --framespersecond <int>   Frame rate. Common: 16 or 24 (model-dependent; e.g., seaweed=24, wan2.1=16).

        --wm / --watermark <true|false>   Whether to add watermark. Default: **false** (per doc).

        --seed <int>                      Random seed in [-1, 2^32-1]. Default **-1** = auto seed.
                                          Same seed may yield similar (not guaranteed identical) results across runs.

        --cf / --camerafixed <true|false> Lock camera movement. Some models support this flag.
                                          true: try to keep camera fixed; false: allow movement. Default: **false**.

    Returns:
        Dict:
            API response containing task creation results for each input item. A typical shape is:
            {
                "status": "success",
                "success_list": [{"video_name": "video_url"}],
                "error_list": []
            }

    Constraints & Tips:
        - Keep prompt concise and focused (建议 ≤ 500 字); too many details may distract the model.
        - If using first/last frames, ensure their **aspect ratio matches** your chosen `--rt` to minimize cropping.
        - If you must reproduce results, specify an explicit `--seed`.
        - Unsupported parameters are ignored silently or may cause validation errors (model-specific).

    Minimal examples:
        1) Text-only batch of two clips at 720p, 16:9, 24 fps:
            params = [
                {
                    "video_name": "cat_park.mp4",
                    "prompt": "小猫骑着滑板穿过公园。 --rs 720p --rt 16:9 --fps 24 --wm false"
                },
                {
                    "video_name": "city_night.mp4",
                    "prompt": "霓虹灯下的城市延时摄影风。 --rs 720p --rt 16:9 --fps 24 --seed 7"
                },
            ]

        2) With guided first/last frame (square, 6 s, camera fixed):
            params = [
                {
                    "video_name": "logo_reveal.mp4",
                    "first_frame": "https://cdn.example.com/brand/logo_start.png",
                    "last_frame": "https://cdn.example.com/brand/logo_end.png",
                    "prompt": "品牌 Logo 从线稿到上色的变化。 --rs 1080p --rt 1:1 --fps 24 --cf true"
                }
            ]
    """
    success_list = []
    error_list = []
    api_key = getenv(
        "MODEL_VIDEO_API_KEY", getenv("MODEL_AGENT_API_KEY", settings.model.api_key)
    )
    base_url = getenv("MODEL_VIDEO_API_BASE", DEFAULT_VIDEO_MODEL_API_BASE)
    model = getenv("MODEL_VIDEO_NAME", DEFAULT_VIDEO_MODEL_NAME)

    logger.debug(f"Using model: {model}")
    logger.debug(f"video_generate params: {params}")

    for start_idx in range(0, len(params), batch_size):
        batch = params[start_idx : start_idx + batch_size]
        logger.debug(f"video_generate batch {start_idx // batch_size}: {batch}")

        task_dict = {}  # task_id: video_name
        tracer = trace.get_tracer("gcp.vertex.agent")
        with tracer.start_as_current_span("call_llm") as span:
            input_part = {"role": "user"}
            output_part = {"message.role": "model"}
            total_tokens = 0

            for idx, item in enumerate(batch):
                input_part[f"parts.{idx}.type"] = "text"
                input_part[f"parts.{idx}.text"] = json.dumps(item, ensure_ascii=False)

                video_name = item["video_name"]
                prompt = item["prompt"]
                first_frame = item.get("first_frame", None)
                last_frame = item.get("last_frame", None)

                try:
                    # Create video generation task
                    response = await generate(prompt, first_frame, last_frame)
                    task_id = response["id"]
                    task_dict[task_id] = video_name
                    logger.debug(f"Created task {task_id} for video {video_name}")
                except Exception as e:
                    logger.error(f"Error creating task for {video_name}: {e}")
                    error_list.append(video_name)
                    continue

            logger.debug("Begin querying video_generate task status...")

            while True:
                task_list = list(task_dict.keys())
                if len(task_list) == 0:
                    break

                # Check each task status
                async with aiohttp.ClientSession() as session:
                    headers = {
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "veadk-source": "veadk",
                        "veadk-version": VERSION,
                        "User-Agent": f"VeADK/{VERSION}",
                        "X-Client-Request-Id": getenv(
                            "MODEL_AGENT_CLIENT_REQ_ID", f"veadk/{VERSION}"
                        ),
                    }

                    for task_id in task_list:
                        try:
                            async with session.get(
                                f"{base_url.rstrip('/')}/contents/generations/tasks/{task_id}",
                                headers=headers,
                            ) as response:
                                response.raise_for_status()
                                result = await response.json()
                                status = result["status"]

                                if status == "succeeded":
                                    video_name = task_dict[task_id]
                                    video_url = result["content"]["video_url"]
                                    logger.debug(
                                        f"{video_name} video_generate succeeded. Video URL: {video_url}"
                                    )
                                    tool_context.state[f"{video_name}_video_url"] = (
                                        video_url
                                    )

                                    success_list.append({video_name: video_url})
                                    task_dict.pop(task_id, None)

                                elif status == "failed":
                                    video_name = task_dict[task_id]
                                    error_msg = result["error"]
                                    logger.error(
                                        f"{video_name} video_generate failed. Error: {error_msg}"
                                    )
                                    error_list.append(video_name)
                                    task_dict.pop(task_id, None)

                                else:
                                    logger.debug(
                                        f"{task_dict[task_id]} video_generate current status: {status}, Retrying after 10 seconds..."
                                    )
                        except Exception as e:
                            logger.error(
                                f"Error checking task status for {task_id}: {e}"
                            )
                            # Keep the task in the dict to retry later

                # Wait before next polling
                await asyncio.sleep(10)

            # Add span attributes
            add_span_attributes(
                span,
                tool_context,
                input_part=input_part,
                output_part=output_part,
                output_tokens=total_tokens,
                total_tokens=total_tokens,
                request_model=model,
                response_model=model,
            )

    if len(success_list) == 0:
        logger.debug(
            f"video_generate success_list: {success_list}\nerror_list: {error_list}"
        )
        return {
            "status": "error",
            "success_list": success_list,
            "error_list": error_list,
        }
    else:
        logger.debug(
            f"video_generate success_list: {success_list}\nerror_list: {error_list}"
        )
        return {
            "status": "success",
            "success_list": success_list,
            "error_list": error_list,
        }


def add_span_attributes(
    span: Span,
    tool_context: ToolContext,
    input_part: dict | None = None,
    output_part: dict | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    total_tokens: int | None = None,
    request_model: str | None = None,
    response_model: str | None = None,
):
    try:
        # common attributes
        app_name = tool_context._invocation_context.app_name
        user_id = tool_context._invocation_context.user_id
        agent_name = tool_context.agent_name
        session_id = tool_context._invocation_context.session.id
        span.set_attribute("gen_ai.agent.name", agent_name)
        span.set_attribute("openinference.instrumentation.veadk", VERSION)
        span.set_attribute("gen_ai.app.name", app_name)
        span.set_attribute("gen_ai.user.id", user_id)
        span.set_attribute("gen_ai.session.id", session_id)
        span.set_attribute("agent_name", agent_name)
        span.set_attribute("agent.name", agent_name)
        span.set_attribute("app_name", app_name)
        span.set_attribute("app.name", app_name)
        span.set_attribute("user.id", user_id)
        span.set_attribute("session.id", session_id)
        span.set_attribute("cozeloop.report.source", "veadk")

        # llm attributes
        span.set_attribute("gen_ai.system", "openai")
        span.set_attribute("gen_ai.operation.name", "chat")
        if request_model:
            span.set_attribute("gen_ai.request.model", request_model)
        if response_model:
            span.set_attribute("gen_ai.response.model", response_model)
        if total_tokens:
            span.set_attribute("gen_ai.usage.total_tokens", total_tokens)
        if output_tokens:
            span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
        if input_tokens:
            span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
        if input_part:
            span.add_event("gen_ai.user.message", input_part)
        if output_part:
            span.add_event("gen_ai.choice", output_part)

    except Exception:
        traceback.print_exc()

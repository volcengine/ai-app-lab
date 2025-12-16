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
import base64
import concurrent.futures
import contextvars
import json
import mimetypes
import traceback
from typing import Dict

from google.adk.tools import ToolContext
from google.genai.types import Blob, Part
from opentelemetry import trace
from opentelemetry.trace import Span
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.images.images import SequentialImageGenerationOptions

from veadk.config import getenv, settings
from veadk.consts import (
    DEFAULT_IMAGE_GENERATE_MODEL_API_BASE,
    DEFAULT_IMAGE_GENERATE_MODEL_NAME,
)
from veadk.utils.logger import get_logger
from veadk.utils.misc import formatted_timestamp, read_file_to_bytes
from veadk.version import VERSION

logger = get_logger(__name__)

client = Ark(
    api_key=getenv(
        "MODEL_IMAGE_API_KEY", getenv("MODEL_AGENT_API_KEY", settings.model.api_key)
    ),
    base_url=getenv("MODEL_IMAGE_API_BASE", DEFAULT_IMAGE_GENERATE_MODEL_API_BASE),
)

executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)
tracer = trace.get_tracer("veadk")


def _build_input_parts(item: dict, task_type: str, image_field):
    input_part = {"role": "user"}
    input_part["parts.0.type"] = "text"
    input_part["parts.0.text"] = json.dumps(item, ensure_ascii=False)

    if image_field:
        if task_type.startswith("single"):
            assert isinstance(image_field, str), (
                f"single_* task_type image must be str, got {type(image_field)}"
            )
            input_part["parts.1.type"] = "image_url"
            input_part["parts.1.image_url.name"] = "origin_image"
            input_part["parts.1.image_url.url"] = image_field
        elif task_type.startswith("multi"):
            assert isinstance(image_field, list), (
                f"multi_* task_type image must be list, got {type(image_field)}"
            )
            assert len(image_field) <= 10, (
                f"multi_* task_type image list length must be <= 10, got {len(image_field)}"
            )
            for i, image_url in enumerate(image_field):
                idx = i + 1
                input_part[f"parts.{idx}.type"] = "image_url"
                input_part[f"parts.{idx}.image_url.name"] = f"origin_image_{i}"
                input_part[f"parts.{idx}.image_url.url"] = image_url

    return input_part


def handle_single_task_sync(
    idx: int, item: dict, tool_context
) -> tuple[list[dict], list[str]]:
    logger.debug(f"handle_single_task_sync item {idx}: {item}")
    success_list: list[dict] = []
    error_list: list[str] = []
    total_tokens = 0
    output_tokens = 0
    output_part = {"message.role": "model"}

    task_type = item.get("task_type", "text_to_single")
    prompt = item.get("prompt", "")
    response_format = item.get("response_format", None)
    size = item.get("size", None)
    watermark = item.get("watermark", None)
    image_field = item.get("image", None)
    sequential_image_generation = item.get("sequential_image_generation", None)
    max_images = item.get("max_images", None)

    input_part = _build_input_parts(item, task_type, image_field)

    inputs = {"prompt": prompt}
    if size:
        inputs["size"] = size
    if response_format:
        inputs["response_format"] = response_format
    if watermark is not None:
        inputs["watermark"] = watermark
    if sequential_image_generation:
        inputs["sequential_image_generation"] = sequential_image_generation
    if image_field is not None:
        inputs["image"] = [image_field]

    with tracer.start_as_current_span(f"call_llm_task_{idx}") as span:
        try:
            if (
                sequential_image_generation
                and sequential_image_generation == "auto"
                and max_images
            ):
                response = client.images.generate(
                    model=getenv("MODEL_IMAGE_NAME", DEFAULT_IMAGE_GENERATE_MODEL_NAME),
                    **inputs,
                    sequential_image_generation_options=SequentialImageGenerationOptions(
                        max_images=max_images
                    ),
                    extra_headers={
                        "veadk-source": "veadk",
                        "veadk-version": VERSION,
                        "User-Agent": f"VeADK/{VERSION}",
                        "X-Client-Request-Id": getenv(
                            "MODEL_AGENT_CLIENT_REQ_ID", f"veadk/{VERSION}"
                        ),
                    },
                )
            else:
                response = client.images.generate(
                    model=getenv("MODEL_IMAGE_NAME", DEFAULT_IMAGE_GENERATE_MODEL_NAME),
                    **inputs,
                    extra_headers={
                        "veadk-source": "veadk",
                        "veadk-version": VERSION,
                        "User-Agent": f"VeADK/{VERSION}",
                        "X-Client-Request-Id": getenv(
                            "MODEL_AGENT_CLIENT_REQ_ID", f"veadk/{VERSION}"
                        ),
                    },
                )

            if not response.error:
                logger.debug(f"task {idx} Image generate response: {response}")

                total_tokens += getattr(response.usage, "total_tokens", 0) or 0
                output_tokens += getattr(response.usage, "output_tokens", 0) or 0

                for i, image_data in enumerate(response.data):
                    image_name = f"task_{idx}_image_{i}"
                    if "error" in image_data:
                        logger.error(f"Image {image_name} error: {image_data.error}")
                        error_list.append(image_name)
                        continue

                    if getattr(image_data, "url", None):
                        image_url = image_data.url
                    else:
                        b64 = getattr(image_data, "b64_json", None)
                        if not b64:
                            logger.error(
                                f"Image {image_name} missing data (no url/b64)"
                            )
                            error_list.append(image_name)
                            continue
                        image_bytes = base64.b64decode(b64)
                        image_url = _upload_image_to_tos(
                            image_bytes=image_bytes, object_key=f"{image_name}.png"
                        )
                        if not image_url:
                            logger.error(f"Upload image to TOS failed: {image_name}")
                            error_list.append(image_name)
                            continue
                        logger.debug(f"Image saved as ADK artifact: {image_name}")

                    tool_context.state[f"{image_name}_url"] = image_url
                    output_part[f"message.parts.{i}.type"] = "image_url"
                    output_part[f"message.parts.{i}.image_url.name"] = image_name
                    output_part[f"message.parts.{i}.image_url.url"] = image_url
                    logger.debug(
                        f"Image {image_name} generated successfully: {image_url}"
                    )
                    success_list.append({image_name: image_url})
            else:
                logger.error(
                    f"Task {idx} No images returned by model: {response.error}"
                )
                error_list.append(f"task_{idx}")

        except Exception as e:
            logger.error(f"Error in task {idx}: {e}")
            traceback.print_exc()
            error_list.append(f"task_{idx}")

        finally:
            add_span_attributes(
                span,
                tool_context,
                input_part=input_part,
                output_part=output_part,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                request_model=getenv(
                    "MODEL_IMAGE_NAME", DEFAULT_IMAGE_GENERATE_MODEL_NAME
                ),
                response_model=getenv(
                    "MODEL_IMAGE_NAME", DEFAULT_IMAGE_GENERATE_MODEL_NAME
                ),
            )
    logger.debug(
        f"task {idx} Image generate success_list: {success_list}\nerror_list: {error_list}"
    )
    return success_list, error_list


async def image_generate(tasks: list[dict], tool_context) -> Dict:
    """Generate images with Seedream 4.0.

    Commit batch image generation requests via tasks.

    Args:
        tasks (list[dict]):
            A list of image-generation tasks. Each task is a dict.
    Per-task schema
    ---------------
    Required:
        - task_type (str):
            One of:
              * "multi_image_to_group"   # 多图生组图
              * "single_image_to_group"  # 单图生组图
              * "text_to_group"          # 文生组图
              * "multi_image_to_single"  # 多图生单图
              * "single_image_to_single" # 单图生单图
              * "text_to_single"         # 文生单图
        - prompt (str)
            Text description of the desired image(s). 中文/English 均可。
            若要指定生成图片的数量，请在prompt中添加"生成N张图片"，其中N为具体的数字。
    Optional:
        - size (str)
            指定生成图像的大小，有两种用法（二选一，不可混用）：
            方式 1：分辨率级别
                可选值: "1K", "2K", "4K"
                模型会结合 prompt 中的语义推断合适的宽高比、长宽。
            方式 2：具体宽高值
                格式: "<宽度>x<高度>"，如 "2048x2048", "2384x1728"
                约束:
                    * 总像素数范围: [1024x1024, 4096x4096]
                    * 宽高比范围: [1/16, 16]
                推荐值:
                    - 1:1   → 2048x2048
                    - 4:3   → 2384x1728
                    - 3:4   → 1728x2304
                    - 16:9  → 2560x1440
                    - 9:16  → 1440x2560
                    - 3:2   → 2496x1664
                    - 2:3   → 1664x2496
                    - 21:9  → 3024x1296
            默认值: "2048x2048"
        - response_format (str)
            Return format: "url" (default, URL 24h 过期) | "b64_json".
        - watermark (bool)
            Add watermark. Default: true.
        - image (str | list[str])   # 仅“非文生图”需要。文生图请不要提供 image
            Reference image(s) as URL or Base64.
            * 生成“单图”的任务：传入 string（exactly 1 image）。
            * 生成“组图”的任务：传入 array（2–10 images）。
        - sequential_image_generation (str)
            控制是否生成“组图”。Default: "disabled".
            * 若要生成组图：必须设为 "auto"。
        - max_images (int)
            仅当生成组图时生效。控制模型能生成的最多张数，范围 [1, 15]， 不设置默认为15。
            注意这个参数不等于生成的图片数量，而是模型最多能生成的图片数量。
            在单图组图场景最多 14；多图组图场景需满足 (len(images)+max_images ≤ 15)。
    Model 行为说明（如何由参数推断模式）
    ---------------------------------
    1) 文生单图: 不提供 image 且 (S 未设置或 S="disabled") → 1 张图。
    2) 文生组图: 不提供 image 且 S="auto" → 组图，数量由 max_images 控制。
    3) 单图生单图: image=string 且 (S 未设置或 S="disabled") → 1 张图。
    4) 单图生组图: image=string 且 S="auto" → 组图，数量 ≤14。
    5) 多图生单图: image=array (2–10) 且 (S 未设置或 S="disabled") → 1 张图。
    6) 多图生组图: image=array (2–10) 且 S="auto" → 组图，需满足总数 ≤15。
    返回结果
    --------
        Dict with generation summary.
        Example:
        {
            "status": "success",
            "success_list": [
                {"image_name": "url"}
            ],
            "error_list": ["image_name"]
        }
    Notes:
    - 组图任务必须 sequential_image_generation="auto"。
    - 如果想要指定生成组图的数量，请在prompt里添加数量说明，例如："生成3张图片"。
    - size 推荐使用 2048x2048 或表格里的标准比例，确保生成质量。
    """
    model = getenv("MODEL_IMAGE_NAME", DEFAULT_IMAGE_GENERATE_MODEL_NAME)

    if model.startswith("doubao-seedream-3-0"):
        logger.error(
            f"Image generation by Doubao Seedream 3.0 ({model}) is depracated. Please use Doubao Seedream 4.0 (e.g., doubao-seedream-4-0-250828) instead."
        )
        return {
            "status": "failed",
            "success_list": [],
            "error_list": [
                "Image generation by Doubao Seedream 3.0 ({model}) is depracated. Please use Doubao Seedream 4.0 (e.g., doubao-seedream-4-0-250828) instead."
            ],
        }

    logger.debug(f"Using model to generate image: {model}")

    success_list: list[dict] = []
    error_list: list[str] = []

    logger.debug(f"image_generate tasks: {tasks}")

    with tracer.start_as_current_span("image_generate"):
        base_ctx = contextvars.copy_context()

        def make_task(idx, item):
            ctx = base_ctx.copy()
            return lambda: ctx.run(handle_single_task_sync, idx, item, tool_context)

        loop = asyncio.get_event_loop()
        futures = [
            loop.run_in_executor(executor, make_task(idx, item))
            for idx, item in enumerate(tasks)
        ]

        results = await asyncio.gather(*futures, return_exceptions=True)

        for res in results:
            if isinstance(res, Exception):
                logger.error(f"Task raised exception: {res}")
                error_list.append("unknown_task_exception")
                continue
            s, e = res
            success_list.extend(s)
            error_list.extend(e)

    if not success_list:
        logger.debug(
            f"image_generate success_list: {success_list}\nerror_list: {error_list}"
        )
        return {
            "status": "error",
            "success_list": success_list,
            "error_list": error_list,
        }
    app_name = tool_context._invocation_context.app_name
    user_id = tool_context._invocation_context.user_id
    session_id = tool_context._invocation_context.session.id
    artifact_service = tool_context._invocation_context.artifact_service

    if artifact_service:
        for image in success_list:
            for _, image_tos_url in image.items():
                filename = f"artifact_{formatted_timestamp()}"
                await artifact_service.save_artifact(
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session_id,
                    filename=filename,
                    artifact=Part(
                        inline_data=Blob(
                            display_name=filename,
                            data=read_file_to_bytes(image_tos_url),
                            mime_type=mimetypes.guess_type(image_tos_url)[0],
                        )
                    ),
                )

    logger.debug(
        f"image_generate success_list: {success_list}\nerror_list: {error_list}"
    )
    return {"status": "success", "success_list": success_list, "error_list": error_list}


def add_span_attributes(
    span: Span,
    tool_context: ToolContext,
    input_part: dict = None,
    output_part: dict = None,
    input_tokens: int = None,
    output_tokens: int = None,
    total_tokens: int = None,
    request_model: str = None,
    response_model: str = None,
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


def _upload_image_to_tos(image_bytes: bytes, object_key: str) -> None:
    try:
        import os
        from datetime import datetime

        from veadk.integrations.ve_tos.ve_tos import VeTOS

        timestamp: str = datetime.now().strftime("%Y%m%d%H%M%S%f")[:-3]
        object_key = f"{timestamp}-{object_key}"
        bucket_name = os.getenv("DATABASE_TOS_BUCKET")
        ve_tos = VeTOS()

        tos_url = ve_tos.build_tos_signed_url(
            object_key=object_key, bucket_name=bucket_name
        )

        ve_tos.upload_bytes(
            data=image_bytes, object_key=object_key, bucket_name=bucket_name
        )

        return tos_url
    except Exception as e:
        logger.error(f"Upload to TOS failed: {e}")
        return None

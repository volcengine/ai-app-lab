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
from typing import Any
import aiohttp
import urllib.parse

from openai import AsyncOpenAI
from veadk.utils.logger import get_logger
from evaluate_agent.utils.types import (
    EvaluationList,
    ScoredImageList,
    ScoredVideoList,
)
from evaluate_agent.prompt import PROMPT_EVALUATE_ITEM_AGENT

# evaluate_agent_instruction = os.getenv("PROMPT_EVALUATE_ITEM_AGENT")
evaluate_agent_instruction = PROMPT_EVALUATE_ITEM_AGENT
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


async def repair_evaluate_input(
    media_list: list[dict[str, Any]], media_type: str = "image"
) -> list[list[dict[str, Any]]]:
    if media_type == "image":
        MEDIA_URL_FIELD = "image_url"
        MEDIA_TYPE_FIELD = "input_image"
        MEDIA = "图片"
    else:
        MEDIA_URL_FIELD = "video_url"
        MEDIA_TYPE_FIELD = "input_video"
        MEDIA = "视频"
    result = []
    for shot in media_list:
        # 这是一组shot
        shot_id = shot.get("shot_id", "")
        reference_media_list = shot.get("reference", [])
        if isinstance(reference_media_list, str):
            reference_media_list = [reference_media_list]
        media_url_list = [image["url"] for image in shot.get("media", [])]
        # 首先构造reference的，这个在同一个shot内通用
        reference_part_list = []
        for reference_media in reference_media_list:
            if len(reference_media.strip()) == 0:
                continue

            # 如果启用了短链接服务，尝试解析reference图片URL
            resolved_reference_url = reference_media
            if shorten_url_service_url:
                resolved_reference_url = await resolve_short_url(reference_media)

            reference_part = {
                "type": "input_image",
                "image_url": resolved_reference_url,
            }  # 参考的只会是图片
            reference_part_list.append(reference_part)

        for i, media_url in enumerate(media_url_list):
            # 如果启用了短链接服务，尝试解析media URL
            resolved_media_url = media_url
            if shorten_url_service_url:
                resolved_media_url = await resolve_short_url(media_url)

            text_part = {
                "type": "input_text",
                "text": (
                    f"本次{MEDIA}的shot_id={shot_id}, media_id={i}，你一共收到{len(reference_media_list) + 1}份媒体素材，其中第1条{MEDIA}是你需要评价的{MEDIA}"
                    + f", 后续的共{len(reference_media_list)}张图片均为参考图片。"
                    if len(reference_media_list) > 0
                    else "" + "请按照要求对媒体素材进行评价并输出符合要求的结果。"
                ),
            }

            user_prompt = {"role": "user", "content": []}
            media_part = {"type": MEDIA_TYPE_FIELD, MEDIA_URL_FIELD: resolved_media_url}
            user_prompt["content"] = [text_part] + [media_part] + reference_part_list

            result.append(user_prompt)

    return result


async def evaluate_media(
    media_list: list[dict[str, Any]], media_type: str = "image"
) -> dict:
    """
    Evaluate a list of storyboard shots, each containing multiple generated media items,
    and return a score list and reasoning for each shot.

    This tool is designed to perform qualitative or model-based evaluation of
    storyboard media (e.g., generated images or videos from prompts or diffusion models)
    based on visual quality, temporal consistency, and coherence with reference materials.

    Each element in `media_list` represents one storyboard shot and includes its
    metadata, descriptive text, and a list of generated media for evaluation.

    Args:
        media_list (List[Dict[str, Any]]):
            A list of storyboard shot data. Each shot should include:

            - **shot_id** (str): The unique identifier for the storyboard shot.
            - **prompt** (str): A detailed text description used to generate the media.
            - **action** (str): The visual or narrative action happening in this shot.
            - **reference** (str): A reference media URL (optional), used as visual guidance.
            - **media** (List[Dict[str, Any]]): The list of generated media items for this shot,
              each containing:
                - **id** (int): The media ID.
                - **url** (str): The URL of the generated media (image or video).
        media_type (str): The type of media to be evaluated. Defaults to "image", only in ["image", "video"].
    Returns:
        List[Dict[str, Any]]: A list of evaluation results, one per shot.
        Each result includes the shot list:
            - **shot_id** (str): The ID of the evaluated shot.
            - **scores** (List[float]): A list of evaluation scores (one per media item)
              indicating visual or semantic quality.
            - **reason** (str): A textual explanation summarizing the evaluation,
              such as prompt alignment, visual coherence, or artistic quality.
    Example:
        evaluate_media([
        ...     {
        ...         "shot_id": "shot_1",
        ...         "prompt": "A samurai walking through cherry blossoms at sunset",
        ...         "action": "Character slowly moves from left to right",
        ...         "reference": "https://example.com/ref1.mp4",
        ...         "media": [
        ...             {"id": 1, "url": "https://example.com/clip1.mp4"},
        ...             {"id": 2, "url": "https://example.com/clip2.mp4"}
        ...         ]
        ...     }
        ... ])
    """
    # 接下来是根据shot id聚合在一起
    logger.debug(f"Start to evaluate {media_type} list: items={len(media_list)}")
    m_content = await repair_evaluate_input(media_list, media_type=media_type)
    logger.debug(f"Repaired {media_type} list: messages={len(m_content)}")
    # 创建异步OpenAI客户端
    client = AsyncOpenAI(
        base_url=os.getenv("MODEL_AGENT_API_BASE"),
        api_key=os.getenv("MODEL_AGENT_API_KEY"),
    )

    # 定义异步处理单个消息的函数
    async def process_message(msg):
        response = await client.responses.create(
            model=os.getenv("MODEL_EVALUATE_ITEM", "doubao-seed-1-6-flash-250828"),
            instructions=evaluate_agent_instruction,
            input=[msg],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "EvaluationList",
                    "schema": EvaluationList.model_json_schema(),
                    "strict": True,
                }
            },
            extra_body={"thinking": {"type": "disabled"}},
        )
        return json.loads(response.output_text).get("evaluation", {})

    # 使用 asyncio.gather 并发处理所有消息
    result = await asyncio.gather(*(process_message(msg) for msg in m_content))

    logger.debug(f"Finish to evaluate {media_type} list: result_items={len(result)}")
    # 后处理：按shot_id合并结果，并确保media_id顺序
    merged_result = {}
    for item in result:
        shot_id = item.get("shot_id")
        # 将media_id转换为整数以便正确排序
        media_id = int(item.get("media_id", 0))

        if shot_id not in merged_result:
            merged_result[shot_id] = {
                "shot_id": shot_id,
                "items": [],  # 先存储所有项，包含media_id以便排序
            }
        merged_result[shot_id]["items"].append(
            (media_id, item.get("scores"), item.get("reason"))
        )

    # 对每个shot_id的结果按media_id升序排序，并构建最终格式
    final_result = []
    for shot_id, data in merged_result.items():
        # 按media_id升序排序
        sorted_items = sorted(data["items"], key=lambda x: x[0])

        # 提取scores和reason列表
        scores = [item[1] for item in sorted_items]
        reason = [item[2] for item in sorted_items]

        final_result.append({"shot_id": shot_id, "scores": scores, "reason": reason})

    logger.debug(
        f"Finish to evaluate {media_type} list: final_result_items={len(final_result)}"
    )

    # 处理返回值：直接构造成 ScoredImageList / ScoredVideoList 并转为字典
    # 将原始输入按 shot_id 建立索引，方便补充元数据
    shot_index = {shot.get("shot_id", ""): shot for shot in media_list}

    def normalize_reference(ref_val):
        if isinstance(ref_val, list):
            return ",".join(ref_val)
        return ref_val or ""

    # 根据媒体类型组装对应的输出结构
    if media_type == "image":
        scored_image_list = []
        for shot_id, data in merged_result.items():
            shot = shot_index.get(shot_id, {})
            media_entries = shot.get("media", [])
            # 将评估结果映射为 {media_id: (score, reason)}
            eval_map = {mi: (score, reason) for mi, score, reason in data["items"]}

            images_items = []
            for idx, media in enumerate(media_entries):
                if idx not in eval_map:
                    continue
                score, reason = eval_map[idx]
                images_items.append(
                    {
                        "id": int(media.get("id", idx)),
                        "url": media.get("url", ""),
                        "score": float(score) if score is not None else 0.0,
                        "reason": reason or "",
                    }
                )

            image_obj = {
                "shot_id": shot_id,
                "prompt": shot.get("prompt", ""),
                "action": shot.get("action", ""),
                "reference": normalize_reference(shot.get("reference")),
                "words": shot.get("words", ""),
                "images": images_items,
            }
            scored_image_list.append(image_obj)

        output = {
            "scored_image_list": scored_image_list,
            "status": {"success": True, "message": ""},
        }
        try:
            model = ScoredImageList.model_validate(output)
            return model.model_dump()
        except Exception:
            return output

    else:
        scored_video_list = []
        for shot_id, data in merged_result.items():
            shot = shot_index.get(shot_id, {})
            media_entries = shot.get("media", [])
            eval_map = {mi: (score, reason) for mi, score, reason in data["items"]}

            videos_items = []
            for idx, media in enumerate(media_entries):
                if idx not in eval_map:
                    continue
                score, reason = eval_map[idx]
                videos_items.append(
                    {
                        "id": int(media.get("id", idx)),
                        "url": media.get("url", ""),
                        "score": float(score) if score is not None else 0.0,
                        "reason": reason or "",
                    }
                )

            video_obj = {
                "shot_id": shot_id,
                "prompt": shot.get("prompt", ""),
                "action": shot.get("action", ""),
                "reference": normalize_reference(shot.get("reference")),
                "words": shot.get("words", ""),
                "videos": videos_items,
            }
            scored_video_list.append(video_obj)

        output = {
            "scored_video_list": scored_video_list,
            "status": {"success": True, "message": ""},
        }
        try:
            model = ScoredVideoList.model_validate(output)
            return model.model_dump()
        except Exception:
            return output

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

import re
from typing import Dict

from director_agent.tools.image_generate_builtin_fix import (
    image_generate as image_generate_builtin,
)
from veadk.utils.logger import get_logger

logger = get_logger(__name__)


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
            注意：这里禁止在prompt字段输入类似：`生成x张图片`这样的描述，请使用 `max_images` 字段来控制生成的图片数量。
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
            仅当生成组图时生效。控制模型能生成的张数。
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
    - size 推荐使用 2048x2048 或表格里的标准比例，确保生成质量。
    """
    logger.debug(f"image_generate_gather tasks: {tasks}")
    new_tasks = []
    task_origin_info = []  # Stores (original_task_index, sub_index_within_group)

    for original_idx, task in enumerate(tasks):
        task_type = task.get("task_type", "")
        is_group_task = task_type in {
            "single_image_to_group",
            "text_to_group",
            "multi_image_to_group",
        }

        if is_group_task:
            num_images = task.get("max_images", 1)
            base_task_type = task_type.replace("_group", "_single")
            for i in range(num_images):
                new_task = task.copy()
                new_task["task_type"] = base_task_type
                new_task.pop("sequential_image_generation", None)
                new_task.pop("max_images", None)
                new_tasks.append(new_task)
                task_origin_info.append((original_idx, i))
        else:
            new_tasks.append(task.copy())
            task_origin_info.append((original_idx, 0))

    for task in new_tasks:
        # 规避prompt中包含"张图片"的情况，这种情况会导致单图变成四宫格或者六宫格之类的图片
        if "prompt" in task and isinstance(task["prompt"], str):
            # 匹配阿拉伯数字和中文数字
            task["prompt"] = re.sub(
                r"[\d一二三四五六七八九十百千万]+张图片", "图片", task["prompt"]
            )
        task["watermark"] = False

    # Call the underlying image_generate function with the flattened list of tasks
    logger.debug(f"image_generate_gather new_tasks: {new_tasks}")
    raw_result = await image_generate_builtin(new_tasks, tool_context)
    logger.debug(f"image_generate_gather raw_result: {raw_result}")

    # Remap the results to match the original task structure
    remapped_success = []
    remapped_errors = set()

    for success_item in raw_result.get("success_list", []):
        for key, url in success_item.items():
            # Key is like 'task_{idx}_image_{i}'
            match = re.match(r"task_(\d+)_image_(\d+)", key)
            if not match:
                continue

            new_task_idx = int(match.group(1))
            if new_task_idx >= len(task_origin_info):
                continue

            original_idx, original_sub_idx = task_origin_info[new_task_idx]
            new_key = f"task_{original_idx}_image_{original_sub_idx}"
            remapped_success.append({new_key: url})

    for error_item in raw_result.get("error_list", []):
        # Error item is like 'task_{idx}'
        match = re.match(r"task_(\d+)", error_item)
        if match:
            new_task_idx = int(match.group(1))
            if new_task_idx < len(task_origin_info):
                original_idx, _ = task_origin_info[new_task_idx]
                remapped_errors.add(f"task_{original_idx}")
            else:
                remapped_errors.add(error_item)  # Keep original error if mapping fails
        else:
            remapped_errors.add(error_item)
    logger.debug(f"image_generate_gather remapped_success: {remapped_success}")
    logger.debug(f"image_generate_gather remapped_errors: {remapped_errors}")

    return {
        "status": raw_result.get("status"),
        "success_list": remapped_success,
        "error_list": list(remapped_errors),
    }

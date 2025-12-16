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

import json
import json_repair
from typing import Optional
from google.adk.agents.callback_context import CallbackContext
from google.adk.events import Event
from google.adk.models import LlmResponse
from pydantic import ValidationError
from veadk.utils.logger import get_logger

from market_agent.tools.is_image import batch_check_images

logger = get_logger(__name__)


async def fix_output_format_with_filter(
    *,
    callback_context: CallbackContext,
    llm_response: LlmResponse,
    model_response_event: Optional[Event] = None,
) -> Optional[LlmResponse]:
    """
    检查输出格式是否符合要求，并尝试修复
    多种情况
    场景1. （正常->正常）无schema，直接返回原始 llm_responses。
    场景2. （正常->正常）有schema，输出无需修复且符合schema，返回 llm_responses。（在代码里是替换了一下，但实际上没区别）
    场景3  （异常->异常）有schema，输出无需修复但不符合schema，返回 原始 llm_responses。输出日志
    场景4. （异常->异常）有schema，输出需要修复，修复失败，返回原始 llm_responses。输出日志
    场景5. （**异常->正常**）有schema，输出需要修复，修复成功后符合schema，返回 修正后的 llm_responses。
    场景6. （异常->异常）有schema，输出需要修复，修复成功后不符合schema，返回 原始 llm_responses。输出日志

    # 过滤部分
    针对market format agent 出现了resources字段中url 非图片的情况，这里直接通过ContentType过滤
    """
    agent = callback_context._invocation_context.agent
    user_id = callback_context._invocation_context.user_id
    session_id = callback_context._invocation_context.session.id
    invocation_id = callback_context.invocation_id
    output_schema = agent.output_schema

    message = f"[fix_output_format]: agent_name:{agent.name} user_id:{user_id} session_id:{session_id} invocation_id:{invocation_id}"
    fixed = False

    # 1. 如果没有直接return即可
    if not output_schema:
        logger.debug(f"{message}\nNo output_schema, return original llm_response")
        return llm_response  # 场景1（成功）

    text = llm_response.content.parts[0].text
    logger.debug(f"{message}\nOriginal llm_response length: {len(text)}")

    # 2. 检查输出格式是否符合output_schema要求
    try:
        output = json.loads(text)
    except json.JSONDecodeError:
        # 尝试修复
        try:
            output = json_repair.loads(text)
            if isinstance(output, list):
                output = output[0]
            fixed = True
        except Exception:
            logger.warning(
                f"{message}\nOutput format is not valid JSON, trying to `json_repair` but failed. Original output length: {len(text)}"
            )
            llm_response = llm_response_validate_error(
                llm_response, "MarketAgent输出不符合规范，且无法修复，请重试"
            )
            return llm_response  # 场景4（失败）

    # 3. 检查输出格式是否符合output_schema要求
    try:
        output_schema.model_validate(output)

        resources = output["product_info"]["resources"]
        is_images_results = await batch_check_images(resources)
        image_indices = [is_image for _, is_image, _ in is_images_results if is_image]
        if len(image_indices) != len(resources):
            logger.warning(
                f"{message}\n `resources`字段中存在非图片内容，该url将被过滤去除: resource: {resources}"
            )
        # 去掉非图片的url
        output["product_info"]["resources"] = [
            resource
            for i, (resource, is_image) in enumerate(zip(resources, image_indices))
            if is_image
        ]

        llm_response.content.parts[0].text = json.dumps(output, ensure_ascii=False)
        return llm_response  # 场景2&场景5（成功）
    except ValidationError:
        if fixed:
            logger.warning(
                f"{message}\nOutput format was not valid JSON, `json_repair` success but the result is not valid for output_schema. Original output length: {len(text)}"
            )
        else:
            logger.warning(
                f"{message}\nOutput format is valid JSON but not valid for output_schema. Original output length: {len(text)}"
            )
        llm_response = llm_response_validate_error(
            llm_response, "MarketAgent输出不符合规范，存在异常，请重试"
        )
        return llm_response  # 场景6 & 场景3（失败）


def llm_response_validate_error(llm_response: LlmResponse, reason: str) -> LlmResponse:
    llm_response.content.parts[0].text = json.dumps(
        {"status": {"success": False, "message": reason}}
    )
    return llm_response

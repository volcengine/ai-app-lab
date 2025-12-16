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
from typing import Any

from openai import AsyncOpenAI
from veadk.utils.logger import get_logger

logger = get_logger(__name__)

filter_agent_instructions = """
你是一个专业的图片理解评论专家，你现在为一个电商营销视频策划方案服务支撑，
你的工作是阅读你收到的图片，理解图片内容，给出详细的描述，
比如你收到了一双鞋子的电商图片，那么你要描述这是什么样的鞋子，颜色，风格，是什么类型的，是帆布鞋还是运动鞋。
并且描述这个商品的一些辅助细节，如这个产品的特点、面向人群、使用场景等等。

你的输出结果将辅助整个电商营销策划方案的完成实现。
"""


def repair_image_input(image: str) -> dict[str, Any]:
    image_part = {
        "type": "input_image",
        "image_url": image,
    }  # 参考的只会是图片
    return image_part


async def comment_image(image: str) -> dict[str, Any]:
    logger.debug(f"开始调用image_understand解析图片：{image}")
    image_part = repair_image_input(image)
    client = AsyncOpenAI(
        base_url=os.getenv("MODEL_AGENT_API_BASE"),
        api_key=os.getenv("MODEL_AGENT_API_KEY"),
    )
    response = await client.responses.create(
        model="doubao-seed-1-6-251015",
        instructions=filter_agent_instructions,
        input=[{"role": "user", "content": [image_part]}],
        extra_body={"thinking": {"type": "disabled"}},
    )
    return {"image": image, "text": response.output_text}

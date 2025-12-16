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

from typing import Any
from urllib.parse import urlparse

from market_agent.tools.image_understand import comment_image
from market_agent.tools.is_image import batch_check_images
from market_agent.tools.web_parse import parse_webpage
from market_agent.tools.filter_by_llm import summarize_text, filter_images
from veadk.utils.logger import get_logger

logger = get_logger(__name__)


async def read_url_link(link_list: list[str]) -> str | list[dict[str, Any]]:
    """
    读取并解析网页内容。

    此异步方法调用 `LinkReader` 工具，对传入的 URL 执行网页内容/图片解析，
    返回解析结果。

    Args:
        link_list (list[str]): 待解析的网页链接列表。

    Returns:
        情况1:
        list[dict[str, Any]]: 解析后的网页/图片内容列表。
        每个字典包含以下键值对：
        按顺序返回每个链接的解析结果
        - 'images':list[str] 图片链接列表。
        - 'text': str 对图片/网页的文本解释。
    """
    logger.debug(f"开始解析链接：{link_list}")
    is_images_results = await batch_check_images(link_list)
    logger.debug(f"图片检测结果： {is_images_results}")
    result = []
    for i, link in enumerate(link_list):
        try:
            # is_images_results 中的每个元素是 (url, is_image, reason) 的元组
            _, is_image, _ = is_images_results[i]
            if is_image:
                res = await comment_image(link)
                result.append(res)
                continue
            else:
                # 调用 `LinkReader` 工具进行网页内容抓取与解析（避免控制台打印完整链接）
                logger.debug(f"调用parse_webpage解析链接域名：{urlparse(link).netloc}")
                images, text = await parse_webpage(link)
                # 过滤掉无效的图片链接
                images = await filter_images(images)
                # 对文本内容进行总结
                text = await summarize_text(text)
                logger.debug(
                    f"对url: {link} \n 解析到图片数量: {len(images)}, 解析到文本长度 {len(text)}"
                )
                if len(text) < 100:
                    logger.debug(f"对url: {link} \n 文本过短，长度: {len(text)}")
                if len(images) > 5:
                    logger.debug(f"对url: {link} \n  图片数量过多，选取前5张")
                    images = images[:5]
                result.append({"images": images, "text": text})

        except Exception as e:
            # 捕获并打印异常信息
            logger.error(f"Error parsing {link}: {e}")
            # 继续处理下一个链接
            result.append({"images": [], "text": ""})

    return result

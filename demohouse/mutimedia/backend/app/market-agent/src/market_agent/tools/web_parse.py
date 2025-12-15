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

from veadk.utils.logger import get_logger
from .web_parser_local import parse_webpage_local

logger = get_logger(__name__)


async def parse_webpage(url, render_js=True, delay=5):
    """
    通用网页解析工具：提取网页的图片URL列表和纯文本内容
    :param url: 目标网页地址
    :param render_js: 是否渲染JS（处理动态页面，默认True）
    :param delay: 渲染延迟（秒，默认5）
    :return: (img_url_list, text_content)
             img_url_list: 图片URL列表（去重、绝对路径）
             text_content: 网页纯文本内容（去空格、去换行）
    """
    logger.debug(f"开始本地解析网页：{url}")

    try:
        # 调用本地网页解析功能
        img_url_list, text_content = await parse_webpage_local(url, render_js, delay)

        logger.debug(
            f"解析完成：找到 {len(img_url_list)} 张图片，文本预览长度 {len(text_content)} 字符"
        )
        return img_url_list, text_content

    except Exception as e:
        logger.error(f"本地解析网页失败：{e}")
        return [], f"网页解析失败: {str(e)}"

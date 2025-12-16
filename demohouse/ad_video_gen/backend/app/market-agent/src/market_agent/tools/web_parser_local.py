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
import socket
import warnings
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from veadk.utils.logger import get_logger

# 忽略无关警告
warnings.filterwarnings("ignore")

# 日志配置
logger = get_logger(__name__)

# 全局浏览器实例（复用避免重复启动，提升性能）
_global_browser = None


async def _init_browser():
    """初始化 Playwright 浏览器（全局复用）"""
    global _global_browser
    if not _global_browser:
        try:
            playwright = await async_playwright().start()
            # 启动浏览器（根据系统环境自动选择）
            _global_browser = await playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-images",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                ],
            )
            logger.info("Chromium 浏览器初始化成功")
        except Exception as e:
            logger.error(f"浏览器初始化失败: {e}", exc_info=True)
            raise


def _is_public_ip(url: str) -> bool:
    """
    检查URL是否解析为公网IP地址，以防止SSRF攻击
    """
    try:
        hostname = url.split("://")[1].split("/")[0].split(":")[0]
        ip_address = socket.gethostbyname(hostname)
        # 检查IP地址是否为私有、保留或回环地址
        if ip_address.startswith(("10.", "172.", "192.168.", "127.", "169.254.")):
            return False
        return True
    except Exception:
        return False


async def parse_webpage_local(url: str, render_js: bool = True, delay: int = 5):
    """
    通用网页解析工具：提取网页的图片URL列表和纯文本内容（基于Playwright）
    :param url: 目标网页地址
    :param render_js: 是否渲染JS（处理动态页面，默认True）
    :param delay: 渲染延迟（秒，默认5）
    :return: (img_url_list, text_content)
    """
    global _global_browser

    logger.info(f"开始网页解析：{url}，render_js={render_js}，延迟={delay}秒")

    # 初始化浏览器（如果尚未初始化）
    if not _global_browser:
        await _init_browser()

    if not _global_browser:
        logger.error("浏览器未初始化")
        raise RuntimeError("浏览器未初始化")

    page = None
    try:
        # 创建新页面
        context = await _global_browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        logger.debug("创建了新的浏览器上下文和页面")

        # 页面请求超时配置
        page.set_default_timeout(15 * 1000)  # 15秒超时
        logger.debug("将页面超时设置为15秒")

        # 增加DoS防护：检查Content-Length
        try:
            with requests.get(url, stream=True, timeout=10) as r:
                content_length = r.headers.get("Content-Length")
                if content_length and int(content_length) > 10 * 1024 * 1024:  # 10MB
                    raise ValueError("响应内容大于10MB，因安全保护拒绝解析")
        except requests.RequestException as e:
            logger.error(f"检查响应大小时出错: {e}")
            raise ValueError("无法访问URL")

        # 访问目标URL
        await page.goto(url, wait_until="domcontentloaded" if render_js else "commit")
        logger.info(f"成功访问URL：{url}")

        # 渲染JS（等待动态内容加载）
        if render_js:
            logger.info(f"等待{delay}秒进行JS渲染")
            try:
                await page.wait_for_load_state("networkidle", timeout=delay * 1000)
            except Exception:
                import asyncio

                await asyncio.sleep(delay)  # 等待页面加载完成
            logger.debug("JS渲染完成")

        # 获取页面完整HTML
        html_content = await page.content()
        logger.debug(f"获取到页面HTML，长度：{len(html_content)}字符")

        # 1. 提取所有图片URL
        img_url_list = []

        # 1.1 提取<img>标签的图片（src/data-src/lazy-src等）
        # 方式1：通过Playwright选择器提取（更高效）
        img_elements = await page.query_selector_all("img")
        logger.debug(f"在页面上找到{len(img_elements)}个img标签")

        for img_elem in img_elements:
            # 获取图片属性
            img_src = (
                await img_elem.get_attribute("src")
                or await img_elem.get_attribute("data-src")
                or await img_elem.get_attribute("lazy-src")
                or await img_elem.get_attribute("data-lazy")
            )
            if img_src:
                absolute_url = urljoin(url, img_src)
                # 过滤无效链接
                if (
                    not absolute_url.startswith(
                        ("data:", "svg:", "javascript:", "blob:")
                    )
                    and "." in absolute_url.split("/")[-1]
                ):
                    img_url_list.append(absolute_url)
        logger.debug(f"从img标签中提取了{len(img_url_list)}张有效图片")

        # 1.2 提取背景图片（style中的background-image）
        bg_pattern = re.compile(r'background-image:\s*url\(["\']?(.*?)["\']?\)', re.I)
        # 获取所有元素的style属性
        all_elements = await page.query_selector_all("*")
        logger.debug(f"检查了{len(all_elements)}个元素的背景图片")

        for elem in all_elements:
            style = await elem.get_attribute("style") or ""
            match = bg_pattern.search(style)
            if match:
                bg_img = match.group(1)
                absolute_bg_url = urljoin(url, bg_img)
                if (
                    absolute_bg_url not in img_url_list
                    and not absolute_bg_url.startswith(("data:", "svg:", "blob:"))
                ):
                    img_url_list.append(absolute_bg_url)
        logger.debug(
            f"从背景样式中提取了{len(img_url_list) - len(set(img_url_list))}张有效图片"
        )

        # 1.3 去重
        img_url_list = list(set(img_url_list))
        logger.debug(f"去重后最终图片列表：{len(img_url_list)}张图片")

        # 2. 提取纯文本内容
        logger.debug("正在提取文本内容")
        soup = BeautifulSoup(html_content, "html.parser")
        # 移除无用标签
        for useless_tag in soup(
            ["script", "style", "noscript", "iframe", "header", "footer"]
        ):
            useless_tag.extract()
        # 格式化文本
        raw_text = soup.get_text(strip=True)
        text_content = re.sub(r"\s+", " ", raw_text)
        logger.debug(f"提取到文本内容，长度：{len(text_content)}字符")

        logger.info(
            f"解析完成：找到 {len(img_url_list)} 张图片，文本长度 {len(text_content)} 字符"
        )
        return img_url_list, text_content

    except Exception as e:
        logger.error(f"解析网页失败: {e}", exc_info=True)
        raise
    finally:
        # 关闭页面和上下文，释放资源
        if page:
            await page.close()
        if "context" in locals():
            await context.close()

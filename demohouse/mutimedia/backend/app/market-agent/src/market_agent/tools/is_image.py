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
import aiohttp
import requests
from typing import List, Tuple

# 图片魔数映射（前N字节特征）
IMAGE_MAGIC_NUMBERS = {
    b"\xff\xd8\xff": "jpeg",  # JPG/JPEG
    b"\x89\x50\x4e\x47\x0d\x0a\x1a\x0a": "png",  # PNG
    b"\x47\x49\x46\x38\x37\x61": "gif",  # GIF87a
    b"\x47\x49\x46\x38\x39\x61": "gif",  # GIF89a
    b"\x52\x49\x46\x46": "webp",  # WebP（RIFF开头，后续验证WEBP）
    b"\x42\x4d": "bmp",  # BMP
    b"\x3c\x73\x76\x67": "svg",  # SVG（文本开头<svg）
}


def is_image_resource(
    url: str, timeout: float = 3.0, allow_redirects: bool = True
) -> Tuple[bool, str]:
    """
    同步判断单个URL是否为图片资源（非URL后缀，仅验证HTTP头/文件内容）
    :param url: 待检测URL
    :param timeout: 超时时间（秒）
    :param allow_redirects: 是否允许重定向
    :return: (是否为图片, 验证依据)
             验证依据可选：content_type / magic_number / error
    """
    # 第一步：发起轻量请求（优先HEAD，失败则降级GET）
    try:
        # 1. 尝试HEAD请求（仅获取响应头，最快）
        resp = requests.head(
            url,
            timeout=timeout,
            allow_redirects=allow_redirects,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
        )
        # 2. HEAD失败则降级为GET（仅读响应头，不下载正文）
        if resp.status_code != 200:
            resp = requests.get(
                url,
                timeout=timeout,
                allow_redirects=allow_redirects,
                stream=True,  # 关键：不下载正文
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            )

        # 3. 验证Content-Type（优先级最高，成本最低）
        content_type = resp.headers.get("Content-Type", "").lower()
        if content_type.startswith("image/"):
            return True, "content_type"

        # 第二步：Content-Type不可靠时，验证文件魔数（仅下载前16字节）
        try:
            # 读取前16字节（足够覆盖所有图片魔数）
            header_bytes = resp.raw.read(16) if resp.raw else b""
            # 匹配魔数
            for magic, _ in IMAGE_MAGIC_NUMBERS.items():
                if header_bytes.startswith(magic):
                    # WebP特殊验证（RIFF后需包含WEBP）
                    if magic == b"\x52\x49\x46\x46" and b"WEBP" not in header_bytes:
                        continue
                    # SVG特殊验证（文本格式，需兼容大小写）
                    if (
                        magic == b"\x3c\x73\x76\x67"
                        and not header_bytes.lower().startswith(b"<svg")
                    ):
                        continue
                    return True, "magic_number"
            return False, "content_type"
        finally:
            resp.close()  # 强制关闭连接，避免资源泄漏

    except Exception as e:
        # 捕获所有异常（超时、网络错误、SSL错误等）
        return False, f"error: {str(e)[:50]}"


async def async_is_image_resource(
    url: str, session: aiohttp.ClientSession, timeout: float = 3.0
) -> Tuple[str, bool, str]:
    """
    异步判断单个URL是否为图片资源（批量场景首选）
    :param url: 待检测URL
    :param session: aiohttp会话（复用连接，提升批量性能）
    :param timeout: 超时时间（秒）
    :return: (url, 是否为图片, 验证依据)
    """
    timeout_obj = aiohttp.ClientTimeout(total=timeout)
    try:
        # 1. 发起GET请求（aiohttp对HEAD支持较差，直接用GET+stream）
        async with session.get(
            url,
            timeout=timeout_obj,
            allow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
        ) as resp:
            # 2. 验证Content-Type
            content_type = resp.headers.get("Content-Type", "").lower()
            if content_type.startswith("image/"):
                return url, True, "content_type"

            # 3. 验证魔数（仅读取前16字节）
            header_bytes = await resp.content.read(16)
            for magic, _ in IMAGE_MAGIC_NUMBERS.items():
                if header_bytes.startswith(magic):
                    if magic == b"\x52\x49\x46\x46" and b"WEBP" not in header_bytes:
                        continue
                    if (
                        magic == b"\x3c\x73\x76\x67"
                        and not header_bytes.lower().startswith(b"<svg")
                    ):
                        continue
                    return url, True, "magic_number"
            return url, False, "content_type"

    except Exception as e:
        return url, False, f"error: {str(e)[:50]}"


async def batch_check_images(
    urls: List[str],
    timeout: float = 3.0,
    max_concurrency: int = 50,  # 并发数
) -> List[Tuple[str, bool, str]]:
    """
    批量异步检测URL是否为图片资源
    :param urls: URL列表
    :param timeout: 单URL超时时间
    :param max_concurrency: 最大并发数
    :return: 列表，每个元素为(url, 是否为图片, 验证依据)
    """
    # 限制并发数（防止请求过多被封禁）
    semaphore = asyncio.Semaphore(max_concurrency)

    async def bounded_check(url):
        async with semaphore:
            return await async_is_image_resource(url, session, timeout)

    # 创建复用的aiohttp会话（提升性能）
    connector = aiohttp.TCPConnector(limit=0)  # 连接池不限制（靠semaphore控制）
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [bounded_check(url) for url in urls]
        results = await asyncio.gather(*tasks)
    return results

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
import hashlib
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# 配置模式
SHORT_LINK_MODE = os.getenv(
    "SHORT_LINK_MODE", "dict"
)  # 默认为字典模式，可选值: "redis", "dict"

# 条件导入Redis
if SHORT_LINK_MODE == "redis":
    try:
        import redis.asyncio as redis

        REDIS_AVAILABLE = True
    except ImportError:
        logging.getLogger("short_link").warning(
            "Redis模式已选择但未安装redis库，请运行: pip install redis；已回退字典模式"
        )
        REDIS_AVAILABLE = False
        SHORT_LINK_MODE = "dict"  # 回退到字典模式
else:
    REDIS_AVAILABLE = False

# 轻量日志
logger = logging.getLogger("short_link")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# 创建FastAPI应用
app = FastAPI(
    title="Short Link Service",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# 存储后端初始化
if SHORT_LINK_MODE == "redis" and REDIS_AVAILABLE:
    # 连接Redis
    storage_client = redis.Redis(
        host=os.getenv("REDIS_HOST"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        username=os.getenv("REDIS_USERNAME"),
        password=os.getenv("REDIS_PASSWORD"),
        db=int(os.getenv("REDIS_DB", 0)),
        decode_responses=True,
    )
else:
    # 使用字典作为存储后端
    logger.info(f"使用字典模式存储短链接 (SHORT_LINK_MODE={SHORT_LINK_MODE})")
    # 初始化字典存储
    dict_storage = {
        "auto_id_counter": 0,
        "long_md5": {},  # long:md5:{md5} -> short_code
        "short": {},  # short:{short_code} -> url
    }

    # 模拟Redis客户端的异步接口
    class DictStorageClient:
        def __init__(self, storage):
            self.storage = storage

        async def get(self, key: str):
            if key.startswith("long:md5:"):
                md5 = key.replace("long:md5:", "")
                return self.storage["long_md5"].get(md5)
            elif key.startswith("short:"):
                short_code = key.replace("short:", "")
                return self.storage["short"].get(short_code)
            return None

        async def setex(self, key: str, ttl: int, value: str):
            # 字典模式不支持TTL，但保留接口兼容性
            if key.startswith("long:md5:"):
                md5 = key.replace("long:md5:", "")
                self.storage["long_md5"][md5] = value
            elif key.startswith("short:"):
                short_code = key.replace("short:", "")
                self.storage["short"][short_code] = value

        async def incr(self, key: str):
            if key == "auto_id:counter":
                self.storage["auto_id_counter"] += 1
                return self.storage["auto_id_counter"]
            return 0

    storage_client = DictStorageClient(dict_storage)

# 进制转换字符集
CHAR_SET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BASE = len(CHAR_SET)


def encode_id(unique_id: int) -> str:
    """
    将自增ID转换为短码
    :param unique_id: 自增ID
    :return: 短码
    """
    if unique_id == 0:
        return CHAR_SET[0]
    short_code = []
    while unique_id > 0:
        unique_id, remainder = divmod(unique_id, BASE)
        short_code.append(CHAR_SET[remainder])
    return "".join(reversed(short_code))


class URLRequest(BaseModel):
    url: str
    type: str = None


@app.post("/shorten", response_model=dict)
async def shorten_url(request: URLRequest):
    """
    生成短链接
    :param url: 原始长URL
    :return: 短码和短链接
    """
    # 计算URL的MD5值
    url = request.url
    url_md5 = hashlib.md5(url.encode()).hexdigest()

    # 检查长URL是否已经生成过短码
    existing_short_code = await storage_client.get(f"long:md5:{url_md5}")
    if existing_short_code:
        domain = os.getenv("SHORT_LINK_DOMAIN", "http://localhost:8005")
        if request.type:
            short_url = f"{domain}/t/{request.type}/{existing_short_code}"
        else:
            short_url = f"{domain}/t/{existing_short_code}"
        return {
            "short_code": existing_short_code,
            "short_url": short_url,
        }

    # 获取自增ID
    unique_id = await storage_client.incr("auto_id:counter")

    # 将自增ID转换为短码
    short_code = encode_id(unique_id)

    # 存储三个核心映射
    await storage_client.setex(f"long:md5:{url_md5}", 24 * 3600, short_code)
    await storage_client.setex(f"short:{short_code}", 24 * 3600, url)

    # 返回结果
    domain = os.getenv("SHORT_LINK_DOMAIN", "http://localhost:8005")
    if request.type:
        short_url = f"{domain}/t/{request.type}/{short_code}"
    else:
        short_url = f"{domain}/t/{short_code}"
    return {"short_code": short_code, "short_url": short_url}


@app.get("/t/{short_code}")
@app.get("/t/{type}/{short_code}")
async def redirect_url(short_code: str, type: str = None):
    """
    短链接跳转
    :param type: 资源类型 (可选)
    :param short_code: 短码
    :return: 重定向到原始长URL
    """
    # 获取原始长URL
    url = await storage_client.get(f"short:{short_code}")
    if not url:
        raise HTTPException(status_code=404, detail="Short code not found")
    return url.strip('"')

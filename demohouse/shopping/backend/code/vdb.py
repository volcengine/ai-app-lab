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

import tos

from httpx import Timeout
from tos import HttpMethodType
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.multimodal_embedding import (
    MultimodalEmbeddingContentPartTextParam,
    MultimodalEmbeddingResponse,
    MultimodalEmbeddingContentPartImageParam,
)
from volcengine.viking_db import *
from volcenginesdkarkruntime.types.multimodal_embedding.embedding_content_part_image_param import (
    ImageURL,
)


COLLECTION_NAME = "shopping_demo"
INDEX_NAME = "shopping_demo"
MODEL_NAME = "doubao-embedding-vision-241215"
LIMIT = 6
SCORE_THRESHOLD = 300

vikingdb_service = VikingDBService(
    host="api-vikingdb.volces.com",
    region="cn-beijing",
    scheme="https",
    connection_timeout=30,
    socket_timeout=30,
)
vikingdb_service.set_ak(os.environ.get("VOLC_ACCESSKEY"))
vikingdb_service.set_sk(os.environ.get("VOLC_SECRETKEY"))

tos_client = tos.TosClientV2(
    os.getenv("VOLC_ACCESSKEY"),
    os.getenv("VOLC_SECRETKEY"),
    "tos-cn-beijing.volces.com",
    "cn-beijing",
)


async def vector_search(text: str, image_url: str) -> str:
    """获取商品相关信息，当想要了解商品信息，比如价格，详细介绍，销量，评价时调用该工具

    Args:
        text: 商品的描述信息
        image_url: 固定填写为<image_url>
    """
    client = AsyncArk(timeout=Timeout(connect=1.0, timeout=60.0))
    embedding_input = []
    if text != "":
        embedding_input = [MultimodalEmbeddingContentPartTextParam(type="text", text=text)]
    if image_url != "":
        embedding_input.append(
            MultimodalEmbeddingContentPartImageParam(
                type="image_url", image_url=ImageURL(url=image_url)
            )
        )
    resp: MultimodalEmbeddingResponse = await client.multimodal_embeddings.create(
        model=MODEL_NAME,
        input=embedding_input,
    )
    embedding = resp.data.get("embedding", [])
    index = await vikingdb_service.async_get_index(COLLECTION_NAME, INDEX_NAME)
    retrieve = await index.async_search_by_vector(vector=embedding, limit=LIMIT)
    retrieve_fields = [
        json.loads(result.fields.get("data"))
        for result in retrieve
        if result.score > SCORE_THRESHOLD
    ]
    mock_data = [
        {
            "名称": item.get("Name", ""),
            "类别": item.get("category", ""),
            "子类别": item.get("sub_category", ""),
            "价格": item.get("price", "99"),
            "销量": item.get("sales", "999"),
            "图片链接": tos_client.pre_signed_url(
                http_method=HttpMethodType.Http_Method_Get,
                bucket="shopping",
                key=item.get("key", ""),
                expires=600,
            ).signed_url,
        }
        for item in retrieve_fields
    ]
    return json.dumps(mock_data, ensure_ascii=False)

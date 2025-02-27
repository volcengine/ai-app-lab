import os
from typing import Any

from httpx import Timeout
from mcp.server.fastmcp import FastMCP
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.multimodal_embedding import MultimodalEmbeddingContentPartTextParam, \
    MultimodalEmbeddingResponse
from volcengine.viking_db import *

mcp = FastMCP("vdb")

COLLECTION_NAME = "<COLLECTION_NAME>"
INDEX_NAME = "<INDEX_NAME>"
MODEL_NAME = "doubao-embedding-vision-241215"
LIMIT = 6

vikingdb_service = VikingDBService(host="api-vikingdb.volces.com", region="cn-beijing", scheme="https",
                                   connection_timeout=30, socket_timeout=30)
vikingdb_service.set_ak(os.environ.get("VOLC_ACCESSKEY"))
vikingdb_service.set_sk(os.environ.get("VOLC_SECRETKEY"))


@mcp.tool()
async def vector_search(text: str, image_url: str) -> List[Any]:
    """获取商品相关信息，当想要了解商品信息，比如价格，详细介绍，销量，评价时调用该工具

    Args:
        text: 商品的描述信息
        image_url: 固定填写为<image_url>
    """
    client = AsyncArk(timeout=Timeout(connect=1.0, timeout=60.0))
    resp: MultimodalEmbeddingResponse = await client.multimodal_embeddings.create(
        model=MODEL_NAME,
        input=[
            MultimodalEmbeddingContentPartTextParam(type="text", text=text),
            # MultimodalEmbeddingContentPartImageParam(type="image_url", image_url=ImageURL(url=image_url)),
            # TODO: vlm支持fc后添加图像，不由模型给出，由人工替换成输入传的url
        ]
    )
    embedding = resp.data.get("embedding", [])
    index = await vikingdb_service.async_get_index(COLLECTION_NAME, INDEX_NAME)
    retrieve = await index.async_search_by_vector(vector=embedding, limit=LIMIT)
    # TODO: gre pre-signed url from tos
    retrieve_fields = [json.loads(result.fields.get("data")) for result in retrieve]
    return retrieve_fields


if __name__ == "__main__":
    mcp.run(transport='stdio')

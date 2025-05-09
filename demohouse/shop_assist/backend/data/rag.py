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

import io
from typing import List, Tuple

import config
import pandas as pd
from tos import TosClientV2
from tos.exceptions import TosServerError
from volcengine.viking_knowledgebase import VikingKnowledgeBaseService

from arkitect.types.llm.model import ActionDetail, ArkMessage, ToolDetail

viking_knowledgebase_service = VikingKnowledgeBaseService(
    host="api-knowledgebase.mlp.cn-beijing.volces.com",
    scheme="https",
    connection_timeout=30,
    socket_timeout=30,
)
viking_knowledgebase_service.set_ak(config.ak)
viking_knowledgebase_service.set_sk(config.sk)

# Initialize TOS client
tos_client = TosClientV2(
    ak=config.ak,
    sk=config.sk,
    region="cn-beijing",
    endpoint="tos-cn-beijing.volces.com",
)


def save_faq(faq_data: pd.DataFrame, account_id: str) -> None:
    """
    Download existing FAQs from TOS, append new FAQ, upload back to TOS in xlsx format,
    and update the knowledge base.

    Args:
        faq_data: Dictionary containing the new FAQ data to append
    """
    bucket_name = config.bucket_name
    if account_id == "":
        account_id = "test"
    object_key = f"custom_support/faq/{account_id}.faq.xlsx"
    try:
        # Download existing FAQs
        object_stream = tos_client.get_object(bucket_name, object_key)
        df = pd.read_excel(io.BytesIO(object_stream.read()))
        df = pd.concat([df, faq_data], ignore_index=True)
    except TosServerError as e:
        if e.status_code != 404:  # NoSuchKey
            raise e
        df = faq_data

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False)
    output.seek(0)

    # Upload updated FAQs back to TOS, meta will be doc meta in knowledgebase
    tos_client.put_object(
        bucket=bucket_name,
        key=object_key,
        content=output,
        # doc_id in knowledgebase must start with a letter
        meta={"doc_id": f"doc_id_{account_id}", "account_id": account_id},
    )
    # Update knowledge base
    collection = viking_knowledgebase_service.get_collection(
        collection_name=config.faq_collection_name,
        project="default",
    )
    collection.add_doc(add_type="tos", tos_path=f"{bucket_name}/{object_key}")


def retrieval_knowledge(
    messages: List[ArkMessage], doc_filter: dict
) -> Tuple[str, ActionDetail]:
    # Rewriting queries in RAG incorporates historical context, ensuring the user’s key
    #  concerns from prior conversations are reflected, improving retrieval relevance.
    pre_processing = {
        "need_instruction": True,
        "rewrite": True,
        "messages": [m.model_dump() for m in messages],
        "return_token_usage": True,
    }

    # seperate retrieval for different doc types
    res = viking_knowledgebase_service.search_knowledge(
        collection_name=config.collection_name,
        query=messages[-1].content,
        pre_processing=pre_processing,
        limit=3,
        dense_weight=0.5,
        post_processing={},
        query_param={"doc_filter": doc_filter},
        project="default",
    )
    faq_res = viking_knowledgebase_service.search_knowledge(
        collection_name=config.faq_collection_name,
        query=messages[-1].content,
        pre_processing=pre_processing,
        limit=5,
        dense_weight=0.5,
        post_processing={},
        query_param={"doc_filter": doc_filter},
        project="default",
    )
    ref = [
        res["doc_info"]
        for res in (res.get("result_list") or []) + (faq_res.get("result_list") or [])
    ]
    action_detail = ActionDetail(
        name="knowledge",
        tool_details=[
            ToolDetail(
                name="retrieval",
                input=faq_res.get("rewrite_query"),
                output=ref,
            )
        ],
    )
    return (
        f"""
# {"参考资料" if config.language == "zh" else "References"}
<context>
{res["result_list"]}
{faq_res["result_list"]}
</context>
""",
        action_detail,
    )

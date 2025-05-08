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
from typing import AsyncIterable, List, Union

import pandas as pd
from volcenginesdkarkruntime import AsyncArk
from config import endpoint_id, language
from data import rag
from data.product import get_products
from data.rag import retrieval_knowledge
from fastapi import HTTPException
from next_question import next_question_chat
from pydantic import BaseModel, Field
from quality_inspection import quality_inspection_chat
from summary import summary_chat
from tools.tools import FUNCTION_MAP, register_support_functions
from utils import get_auth_header, get_handler

from arkitect.core.component.bot.server import BotServer
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.tool.tool_pool import build_tool_pool
from arkitect.core.errors import InternalServiceError
from arkitect.launcher.runner import (
    get_default_client_configs,
    get_endpoint_config,
    get_runner,
)
from arkitect.telemetry.trace import task
from arkitect.telemetry.trace.setup import setup_tracing
from arkitect.types.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
    BotUsage,
)
from arkitect.utils.context import (
    set_resource_id,
    set_resource_type,
)


@task()
async def custom_support_chat(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    parameters = ArkChatParameters(**request.__dict__)
    meta_data = request.metadata if request.metadata else {}
    account_id = meta_data.get("account_id", "test")
    functions = meta_data.get(
        "support_functions",
        [*FUNCTION_MAP],
    )
    products = meta_data.get("product_list", [*get_products()])

    # insert knowledge
    tools, system_prompt = register_support_functions(functions, products, account_id)
    messages = [ArkMessage(role="system", content=system_prompt)]
    messages.extend(request.messages)
    knowledge_prompt, action_detail = retrieval_knowledge(
        messages,
        {
            "op": "or",
            "conds": [
                {"op": "must", "field": "account_id", "conds": [account_id]},
                {
                    "op": "must",
                    "field": "产品名" if language == "zh" else "product_name",
                    "conds": products,
                },
            ],
        },
    )
    llm = BaseChatLanguageModel(
        model=endpoint_id,
        messages=messages,
        parameters=parameters,
    )

    if request.stream:
        async for resp in llm.astream(
            functions=tools,
            additional_system_prompts=[knowledge_prompt],
            extra_headers=get_auth_header(),
        ):
            if resp.usage:
                resp.bot_usage = BotUsage(action_details=[action_detail])
            yield resp
    else:
        resp = await llm.arun(
            functions=tools,
            additional_system_prompts=[knowledge_prompt],
            extra_headers=get_auth_header(),
        )
        resp.bot_usage = BotUsage(action_details=[action_detail])
        yield resp


class Product(BaseModel):
    name: str
    description: str = Field(..., max_length=100)
    cover_image: str


class ProductListResponse(BaseModel):
    products: List[Product]
    total: int


async def list_products():
    products_dict = get_products()
    return ProductListResponse(
        products=[Product(**v) for v in products_dict.values()],
        total=len(products_dict),
    )


class FAQRequest(BaseModel):
    question: str = Field(..., max_length=100)
    answer: str = Field(..., max_length=500)
    score: int = Field(..., ge=1, le=5)
    account_id: str = Field(..., max_length=100)


async def save_faq(faq: FAQRequest):
    columns_order = ["question", "answer", "score"]
    try:
        rag.save_faq(
            pd.DataFrame(
                [{"question": faq.question, "answer": faq.answer, "score": faq.score}],
                columns=columns_order,
            ),
            faq.account_id,
        )
    except Exception as e:
        err = InternalServiceError(str(e))
        raise HTTPException(
            status_code=err.http_code,
            detail=err.to_error().model_dump(exclude_none=True, exclude_unset=True),
        )
    return {"message": "success"}


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    set_resource_type(os.getenv("RESOURCE_TYPE") or "")
    set_resource_id(os.getenv("RESOURCE_ID") or "")

    setup_tracing(endpoint=os.getenv("TRACE_ENDPOINT"), trace_on=False)

    server: BotServer = BotServer(
        runner=get_runner(custom_support_chat),
        health_check_path="/v1/ping",
        endpoint_config=get_endpoint_config(
            "/api/v3/bots/chat/completions", custom_support_chat
        ),
        clients={
            "ark": (
                AsyncArk,
                {
                    "base_url": "https://ark.cn-beijing.volces.com/api/v3"
                    if language == "zh"
                    else "https://ark.ap-southeast.volces.com/api/v3",
                    "region": "cn-beijing" if language == "zh" else "ap-southeast-1",
                },
            ),
        },
    )
    server.app.add_api_route(
        "/api/v3/bots/chat/completions",
        get_handler(custom_support_chat),
        methods=["POST"],
    )
    server.app.add_api_route(
        "/api/v3/bots/chat/completions/products",
        list_products,
        methods=["GET"],
        response_model=ProductListResponse,
    )
    server.app.add_api_route(
        "/api/v3/bots/chat/completions/save_faq", save_faq, methods=["POST"]
    )
    server.app.add_api_route(
        "/api/v3/bots/chat/completions/summary",
        get_handler(summary_chat),
        methods=["POST"],
    )
    server.app.add_api_route(
        "/api/v3/bots/chat/completions/quality_inspection",
        get_handler(quality_inspection_chat),
        methods=["POST"],
    )
    server.app.add_api_route(
        "/api/v3/bots/chat/completions/next_question",
        get_handler(next_question_chat),
        methods=["POST"],
    )
    server.run(app=server.app, port=int(port) if port else 8080, host="0.0.0.0")

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

import logging
import os
import re
from typing import AsyncIterable
from mem0.configs.base import MemoryConfig as Mem0Config
from mem0.embeddings.configs import EmbedderConfig
from mem0.llms.configs import LlmConfig
from mem0.vector_stores.configs import VectorStoreConfig
from arkitect.core.component.runner.config import RunnerConfig, MemoryUpdateSetting
from tools import get_commute_duration, get_instructions, web_search

from arkitect.core.component.agent import DefaultAgent
from arkitect.core.component.memory.mem0_memory_service import (
    Mem0MemoryService as MemoryService,
)
from arkitect.core.component.memory.mem0_memory_service import (
    Mem0MemoryServiceSingleton,
)
from arkitect.core.component.runner import Runner
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatCompletionChunk, ArkChatRequest, ArkMessage
from arkitect.types.responses.utils import event_to_ark_chat_completion_chunks

MODELS = {
    # "default": "doubao-1-5-vision-pro-32k-250115",
    "default": "doubao-1-5-vision-pro-32k-250115",
    "reasoning": "deepseek-r1-250120",
    "vision": "doubao-1-5-vision-pro-32k-250115",
}

DEFAULT_EMBEDDING_MODEL = "doubao-embedding-text-240715"
DEFAULT_LLM_MODEL = "doubao-1-5-vision-pro-32k-250115"
DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
LONG_TERM_MEMORY_VDB = "mem0_test"
MILVUS_URL = os.getenv("MILVUS_URL")
MILVUS_TOKEN = os.getenv("MILVUS_TOKEN")

APP_NAME = "property_agent"


def preprocess_reqeusts(messages: list[ArkMessage]) -> list[ArkMessage]:
    refined_messages = []
    front_part = messages[-1].content.split("Show all media")[0]
    pattern = r"!\[[^\]]*\]\((https?://[^\s)]+?\.(?:jpg|jpeg|png|gif))\)"
    image_urls = re.findall(pattern, front_part, re.IGNORECASE)
    for image_url in image_urls:
        if "youtube" in image_url:
            continue
        refined_messages.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": image_url,
                    "detail": "auto",
                },
            }
        )
    refined_messages.append(
        {
            "type": "text",
            "text": messages[-1].content,
        }
    )
    return messages
    # return [ArkMessage(role="user", content=refined_messages)]


async def update_memory(
    user_id: str,
    messages: list[ArkMessage],
    mem_service: MemoryService,
) -> None:
    return await mem_service.update_memory(
        user_id=user_id,
        new_messages=messages,
    )


@task(distributed=False)
async def main(request: ArkChatRequest) -> AsyncIterable[ArkChatCompletionChunk]:
    user_id = request.metadata.get("user_id")
    is_update_memory = request.metadata.get("update_memory", False)
    logging.basicConfig(
        level=logging.DEBUG,
    )

    default_ark_config = Mem0Config(
        embedder=EmbedderConfig(
            provider="openai",
            config={
                "model": DEFAULT_EMBEDDING_MODEL,
                "openai_base_url": DEFAULT_BASE_URL,
                "api_key": os.getenv("ARK_API_KEY"),
                "embedding_dims": 2560,
            },
        ),
        llm=LlmConfig(
            provider="openai",
            config={
                "model": DEFAULT_LLM_MODEL,
                "openai_base_url": DEFAULT_BASE_URL,
                "api_key": os.getenv("ARK_API_KEY"),
                "enable_vision": True,
            },
        ),
        vector_store=VectorStoreConfig(
            provider="milvus",
            config={
                "url": MILVUS_URL,
                "token": MILVUS_TOKEN,
                "collection_name": LONG_TERM_MEMORY_VDB,
                "embedding_model_dims": 2560,
                "metric_type": "IP",
            },
        ),
    )

    mem_service: MemoryService = Mem0MemoryServiceSingleton.get_instance_sync(
        default_ark_config
    )

    if is_update_memory:
        await update_memory(
            user_id=user_id, messages=request.messages, mem_service=mem_service
        )
        return
        yield
    house_agent = DefaultAgent(
        model=MODELS["default"],
        name="Housing Agent",
        tools=[get_commute_duration, web_search],
        instruction=await get_instructions(user_id=user_id, memory_service=mem_service),
    )
    runner = Runner(
        app_name=APP_NAME,
        agent=house_agent,
        memory_service=mem_service,
        config=RunnerConfig(
            memory_update_behavior=MemoryUpdateSetting.NO_AUTO_UPDATE,
        ),
    )
    messages = preprocess_reqeusts(request.messages)
    async for resp in runner.run(messages=messages, user_id=user_id):
        yield event_to_ark_chat_completion_chunks(resp)


if __name__ == "__main__":
    port = os.getenv("_BYTEFAAS_RUNTIME_PORT")
    # setup_tracing()
    launch_serve(
        package_path="main",
        clients={},
        port=int(port) if port else 8888,
        host=None,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
    )

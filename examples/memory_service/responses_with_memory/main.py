import logging
import os
import time
from typing import AsyncIterable

import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk
from arkitect.core.component.memory import (
    Mem0MemoryService as MemoryService,
)  # InMemoryMemoryServiceSingleton,; InMemoryMemoryService as MemoryService,
from arkitect.core.component.memory import Mem0MemoryServiceSingleton

# from arkitect.core.component.memory import (
#     InMemoryMemoryService as MemoryService,
# )
# from arkitect.core.component.memory import (
#     InMemoryMemoryServiceSingleton,
# )
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatCompletionChunk, ArkChatRequest
from mem0.configs.base import MemoryConfig as Mem0Config
from mem0.embeddings.configs import EmbedderConfig
from mem0.llms.configs import LlmConfig
from mem0.vector_stores.configs import VectorStoreConfig
from openai import OpenAI
from openai.types.responses.response_stream_event import (
    ResponseCompletedEvent,
    ResponseStreamEvent,
    ResponseTextDeltaEvent,
)
from responses_client import ResponsesClientWithLongTermMemory

DEFAULT_EMBEDDING_MODEL = "doubao-embedding-text-240715"
DEFAULT_LLM_MODEL = "doubao-1-5-vision-pro-32k-250115"
DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


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
        provider="vikingdb",
        config={
            "collection_name": "mem0_test",
            "embedding_model_dims": 2560,
            "metric_type": "IP",
            "ak": os.getenv("VOLC_ACCESSKEY"),
            "sk": os.getenv("VOLC_SECRETKEY"),
        },
    ),
)


def convert_chunk(chunk: ResponseStreamEvent) -> ArkChatCompletionChunk | None:
    if isinstance(chunk, ResponseTextDeltaEvent):
        return ArkChatCompletionChunk(
            id=chunk.item_id,
            created=int(time.time()),
            model="gpt-4o",
            choices=[
                completion_chunk.Choice(
                    delta=completion_chunk.ChoiceDelta(
                        role="assistant", content=chunk.delta
                    ),
                    index=0,
                )
            ],
            object="chat.completion.chunk",
        )
    elif isinstance(chunk, ResponseCompletedEvent):
        return ArkChatCompletionChunk(
            id=chunk.response.id,
            created=int(time.time()),
            model="gpt-4o",
            choices=[],
            object="chat.completion.chunk",
            metadata={"response": chunk.response.model_dump()},
        )


@task(distributed=False)
async def main(request: ArkChatRequest) -> AsyncIterable[ArkChatCompletionChunk]:

    mem_service: MemoryService = Mem0MemoryServiceSingleton.get_instance_sync(
        default_ark_config
    )

    user_id = request.metadata["user_id"]
    previous_resp_id = request.metadata.get("previous_response_id")
    client = OpenAI()
    responses_client = ResponsesClientWithLongTermMemory(
        memory_service=mem_service, client=client
    )
    logging.basicConfig(
        level=logging.DEBUG,
    )

    async for chunk in responses_client.chat(
        messages=request.messages,
        user_id=user_id,
        use_tool=True,
        previous_response_id=previous_resp_id,
    ):
        converted_chunk = convert_chunk(chunk)
        if converted_chunk:
            yield converted_chunk


if __name__ == "__main__":
    port = os.getenv("_BYTEFAAS_RUNTIME_PORT")
    # setup_tracing()
    launch_serve(
        package_path="main",
        clients={},
        port=int(port) if port else 10888,
        host=None,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
    )

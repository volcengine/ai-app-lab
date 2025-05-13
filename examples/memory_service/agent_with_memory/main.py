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
import uuid

from typing import AsyncIterable

from arkitect.types.llm.model import ArkChatRequest, ArkMessage
from arkitect.core.component.runner import Runner
from arkitect.types.responses.utils import event_to_ark_chat_completion_chunks

from arkitect.core.component.agent import DefaultAgent
from arkitect.core.component.checkpoint import (
    InMemoryCheckpointStoreSingleton,
    InMemoryCheckpointStore,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatCompletionChunk

from arkitect.core.component.memory import (
    Mem0MemoryServiceSingleton,
    Mem0MemoryService as MemoryService,
    # InMemoryMemoryServiceSingleton,
    # InMemoryMemoryService as MemoryService,
)
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)
from tools import get_commute_duration, get_instructions, web_search
import re

import logging

MODELS = {
    # "default": "doubao-1-5-vision-pro-32k-250115",
    "default": "doubao-1-5-thinking-vision-pro-250428",
    "reasoning": "deepseek-r1-250120",
    "vision": "doubao-1-5-vision-pro-32k-250115",
}

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
    return [ArkMessage(role="user", content=refined_messages)]


async def agent_task(
    request: ArkChatRequest, mem_service: MemoryService
) -> AsyncIterable[ArkChatCompletionChunk]:
    logging.basicConfig(
        level=logging.DEBUG,
    )
    user_id = request.metadata.get("user_id")

    checkpoint_store: InMemoryCheckpointStore = (
        InMemoryCheckpointStoreSingleton.get_instance_sync()
    )

    house_agent = DefaultAgent(
        model=MODELS["default"],
        name="Housing Agent",
        tools=[get_commute_duration, web_search],
        instruction=await get_instructions(user_id=user_id, memory_service=mem_service),
    )
    runner = Runner(
        app_name=APP_NAME,
        agent=house_agent,
        checkpoint_store=checkpoint_store,
    )
    checkpoint_id = str(uuid.uuid4())
    checkpoint = await runner.get_or_create_checkpoint(checkpoint_id)
    await checkpoint_store.update_checkpoint(APP_NAME, checkpoint_id, checkpoint)
    messages = preprocess_reqeusts(request.messages)
    async for resp in runner.run(checkpoint_id, messages=messages):
        yield event_to_ark_chat_completion_chunks(resp)


async def update_memory(
    user_id: str, messages: list[ChatCompletionMessage], mem_service: MemoryService
) -> None:
    return await mem_service.add_or_update_memory(
        user_id=user_id,
        new_messages=messages,
    )


@task(distributed=False)
async def main(request: ArkChatRequest) -> AsyncIterable[ArkChatCompletionChunk]:
    user_id = request.metadata["user_id"]
    # mem_service: MemoryService = InMemoryMemoryServiceSingleton.get_instance_sync()
    mem_service: MemoryService = Mem0MemoryServiceSingleton.get_instance_sync()

    if len(request.messages) == 1:
        async for resp in agent_task(request, mem_service):
            yield resp
    else:
        await update_memory(
            user_id=user_id,
            messages=request.messages[1:],
            mem_service=mem_service,
        )


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

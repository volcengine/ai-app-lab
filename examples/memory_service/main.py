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

from typing import AsyncIterable, Any

from arkitect.types.llm.model import ArkChatRequest
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
import logging

MODELS = {
    "default": "doubao-1-5-thinking-vision-pro-250428",
    "reasoning": "deepseek-r1-250120",
    "vision": "doubao-1-5-vision-pro-32k-250115",
}

APP_NAME = "property_agent"

# --- Configuration ---
# CONFIG_FILE_PATH = "./mcp_config.json" # For MCP tools, if any


# --- Placeholder Tools ---
def get_commute_duration(
    start_address: str, end_address: str, mode: str = "driving"
) -> dict[str, str]:
    """
    Placeholder for Google Maps API to find commute duration.
    Args:
        start_address (str): The starting address.
        end_address (str): The destination address.
        mode (str): Commute mode (e.g., driving, transit, walking).
    Returns:
        dict: A dictionary containing commute duration and distance.
    """
    print(
        f"Tool: get_commute_duration called for {start_address} to {end_address} via {mode}"
    )
    # Simulate API call
    if "office" in end_address.lower():
        return {"duration": "30 mins", "distance": "15 km"}
    return {"duration": "unknown", "distance": "unknown"}


def search_property_comments(property_name: str, address: str) -> dict[str, Any]:
    """
    Placeholder for web search to find property comments or reviews.
    Args:
        property_name (str): Name of the property.
        address (str): Address of the property.
    Returns:
        dict: A dictionary containing found comments or a summary.
    """
    print(f"Tool: search_property_comments called for {property_name} at {address}")
    # Simulate web search
    if "Starville" in property_name:
        return {
            "summary": "Generally positive reviews, noted for good amenities but can be pricey."
        }
    return {"summary": "No specific comments found."}


async def agent_task(request: ArkChatRequest) -> AsyncIterable[ArkChatCompletionChunk]:
    logging.basicConfig(
        level=logging.DEBUG,
    )

    checkpoint_store: InMemoryCheckpointStore = (
        InMemoryCheckpointStoreSingleton.get_instance_sync()
    )

    supervisor = DefaultAgent(
        model=MODELS["default"],
        name="Housing Agent",
        tools=[get_commute_duration, search_property_comments],
        instruction="",
    )
    runner = Runner(
        app_name=APP_NAME,
        agent=supervisor,
        checkpoint_store=checkpoint_store,
    )
    checkpoint_id = str(uuid.uuid4())
    checkpoint = await runner.get_or_create_checkpoint(checkpoint_id)
    await checkpoint_store.update_checkpoint(APP_NAME, checkpoint_id, checkpoint)

    async for resp in runner.run(checkpoint_id, messages=request.messages):
        yield event_to_ark_chat_completion_chunks(resp)


@task(distributed=False)
async def main(request: ArkChatRequest) -> AsyncIterable[ArkChatCompletionChunk]:
    if len(request.messages) == 1:
        async for resp in agent_task(request):
            yield resp
    else:
        print(request.messages[-1])
        return


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

import logging
import os
import re
from typing import AsyncIterable
import time
from openai import OpenAI
from openai.types.responses.response_stream_event import (
    ResponseStreamEvent,
    ResponseTextDeltaEvent,
    ResponseCompletedEvent,
)
import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk
from volcenginesdkarkruntime.types.chat.chat_completion import (
    ChatCompletionMessage,
    Choice,
)
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)

# from arkitect.core.component.memory import (
#     Mem0MemoryService as MemoryService,
# )  # InMemoryMemoryServiceSingleton,; InMemoryMemoryService as MemoryService,
# from arkitect.core.component.memory import Mem0MemoryServiceSingleton
from arkitect.core.component.memory import (
    InMemoryMemoryService as MemoryService,
    InMemoryMemoryServiceSingleton,
)
from arkitect.core.component.memory.base_memory_service import BaseMemoryService
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatCompletionChunk, ArkChatRequest, ArkMessage

client = OpenAI()  # Assumes OPENAI_API_KEY environment variable is set


async def get_instructions(user_id: str, memory_service: BaseMemoryService) -> str:
    memory = await memory_service.search_memory(
        user_id, query="Details of room preferences for this user."
    )
    user_preference = memory.content
    if len(memory.memories) == 0:
        user_preference = "No user preferences found."
    base_instruction = f"""
You are a helpful assistant that helps evaluate housing rentals for users based on their preferences.

User's preferences:
{user_preference}

Below is a new housing rental listing. Determine whether it matches the user's preferences. If you think there is insufficient information,
You can use tools like web_search and maps to find our more information.

If it does, explain briefly why. If it doesn't, explain what does not match.

Your response should be structured as:
Match: Yes/No
Explanation: [Brief explanation here]
"""
    print(base_instruction)
    return base_instruction


async def get_openai_response_stream(
    message: list[dict],
    user_id: str,
    memory_service: BaseMemoryService,
    model="gpt-4o",
    previous_response_id: str | None = None,
    use_tool: bool = False,
):
    """
    Gets a streaming response from OpenAI's chat completion API
    and prints detailed information from each chunk.
    """
    try:
        stream = client.responses.create(
            model=model,
            input=message,
            stream=True,
            previous_response_id=previous_response_id,
            tools=[{"type": "web_search_preview"}] if use_tool else None,
            instructions=await get_instructions(
                user_id=user_id, memory_service=memory_service
            ),
        )
        print("\n--- Streaming Response Chunk Details ---")
        chunk_count = 0
        for chunk in stream:
            chunk_count += 1
            print(f"\n--- Chunk {chunk_count} ---")
            print(chunk)
            yield chunk

        print("\n\n--- End of Stream ---")
        return
    except Exception as e:
        print(f"An error occurred in streaming call: {e}")
        return


def preprocess_reqeusts(messages: list[ArkMessage]) -> list[dict]:
    refined_messages = []
    front_part = messages[-1].content.split("Show all media")[0]
    pattern = r"!\[[^\]]*\]\((https?://[^\s)]+?\.(?:jpg|jpeg|png|gif))\)"
    image_urls = re.findall(pattern, front_part, re.IGNORECASE)
    for image_url in image_urls:
        if "youtube" in image_url:
            continue
        refined_messages.append(
            {
                "type": "input_image",
                "image_url": image_url,
                "detail": "auto",
            }
        )
    refined_messages.append(
        {
            "type": "input_text",
            "text": messages[-1].content,
        }
    )
    return [
        {
            "role": "user",
            "content": refined_messages,
        }
    ]


async def agent_task(
    request: ArkChatRequest, mem_service: MemoryService
) -> AsyncIterable[ArkChatCompletionChunk]:
    logging.basicConfig(
        level=logging.DEBUG,
    )
    user_id = request.metadata.get("user_id")

    async for chunk in get_openai_response_stream(
        message=preprocess_reqeusts(messages=request.messages),
        use_tool=True,
        user_id=user_id,
        memory_service=mem_service,
    ):
        converted_chunk = convert_chunk(chunk)
        if converted_chunk:
            yield converted_chunk


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


async def update_memory(
    user_id: str, messages: list[ChatCompletionMessage], mem_service: MemoryService
) -> None:
    return await mem_service.add_or_update_memory(
        user_id=user_id, new_messages=messages
    )


@task(distributed=False)
async def main(request: ArkChatRequest) -> AsyncIterable[ArkChatCompletionChunk]:
    user_id = request.metadata["user_id"]
    mem_service: MemoryService = InMemoryMemoryServiceSingleton.get_instance_sync()
    # mem_service: MemoryService = Mem0MemoryServiceSingleton.get_instance_sync()

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

from enum import Enum
import re

from openai import NOT_GIVEN, OpenAI
from openai.types.responses.response_input_param import ResponseInputParam
from openai.types.responses.response_stream_event import ResponseCompletedEvent


from arkitect.core.component.memory.base_memory_service import BaseMemoryService
from arkitect.types.llm.model import ArkMessage
from arkitect.telemetry.logger import INFO


class MemoryUpdateBehaviour(str, Enum):
    NO_AUTO_UPDATE = "NO_AUTO_UPDATE"
    BLOCKING = "BLOCKING"
    NON_BLOCKING = "NON_BLOCKING"


def preprocess_reqeusts(messages: list[ArkMessage]) -> ResponseInputParam:
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


class ResponsesClientWithLongTermMemory:
    def __init__(self, memory_service: BaseMemoryService, client: OpenAI):
        self.memory_service = memory_service
        self.client = client

    async def chat(
        self,
        messages: list[ArkMessage],
        user_id: str,
        model="gpt-4o",
        previous_response_id: str | None = None,
        use_tool: bool = False,
        memory_update_behavior: MemoryUpdateBehaviour = MemoryUpdateBehaviour.BLOCKING,
    ):
        """
        Gets a streaming response from OpenAI's chat completion API
        and prints detailed information from each chunk.
        """
        converted_messages = preprocess_reqeusts(messages=messages)

        try:
            stream = self.client.responses.create(
                model=model,
                input=converted_messages,
                stream=True,
                previous_response_id=(
                    previous_response_id if previous_response_id else NOT_GIVEN
                ),
                tools=[{"type": "web_search_preview"}] if use_tool else None,
                instructions=await self.get_user_profile(user_id=user_id),
            )
            print("\n--- Streaming Response Chunk Details ---")
            last_chunk = None
            for chunk in stream:
                print(chunk)
                yield chunk
                last_chunk = chunk
        except Exception as e:
            print(e)
            return

        assert isinstance(last_chunk, ResponseCompletedEvent)

        if memory_update_behavior != MemoryUpdateBehaviour.NO_AUTO_UPDATE:
            messages.append(last_chunk.response)
            await self.memory_service.update_memory(
                user_id=user_id,
                new_messages=messages,
                blocking=(
                    True
                    if memory_update_behavior == MemoryUpdateBehaviour.BLOCKING
                    else False
                ),
            )
        else:
            INFO("No memory update")
        print("--- End of Streaming Response ---")
        return

    async def get_user_profile(self, user_id: str) -> str:
        memory = await self.memory_service.search_memory(
            user_id, query="Details of room preferences for this user."
        )
        user_preference = memory.content
        if len(memory.memories) == 0:
            user_preference = "No user preferences found."
        base_instruction = f"""
You are a helpful assistant that helps evaluate housing rentals for users based on
their preferences.

User's preferences:
{user_preference}

Below is a new housing rental listing. 
Determine whether it matches the user's preferences. 
If you think there is insufficient information,
You can use tools like web_search and maps to find our more information.

If it does, explain briefly why. If it doesn't, explain what does not match.

Your response should be structured as:
Match: Yes/No
Explanation: [Brief explanation here]
"""
        print(base_instruction)
        return base_instruction

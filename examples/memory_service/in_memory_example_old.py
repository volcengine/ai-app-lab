import asyncio
import json
from pathlib import Path
from arkitect.core.memory.in_memory_memory_service import (
    InMemoryMemoryService as MemoryService,
)

# from arkitect.core.memory.mem0_memory_service import Mem0MemoryService as MemoryService
from volcenginesdkarkruntime import AsyncArk


async def main():
    # Initialize services
    mem_service = MemoryService()
    ark_client = AsyncArk()

    # Load test interactions
    test_file = Path(__file__).parent / "test_interactions.json"
    with open(test_file) as f:
        test_data = json.load(f)

    user_id = "test_user"
    print("=== Running Memory Test Sequence ===")
    print("Each interaction will show:")
    print("1. User Input")
    print("2. Retrieved Memory")
    print("3. Assistant Response")
    print("=" * 40)

    for idx, interaction in enumerate(test_data["interactions"], 1):
        user_input = interaction["user_input"]
        print(f"\n[Interaction {idx}]")
        print(f"1. User Input: {user_input}")
        print("=" * 40)

        # Create message object
        user_message = [{"role": "user", "content": user_input}]

        # Retrieve relevant memory
        memory = await mem_service.search_memory(user_id=user_id, query=user_input)
        memory_content = (
            memory.memories[0].memory_content if memory.memories else "No memory yet"
        )
        print(f"2. Retrieved Memory: {memory_content}")
        print("=" * 40)

        # Get LLM response with memory context
        llm_resp = await ark_client.chat.completions.create(
            model="doubao-1-5-pro-32k-250115",
            messages=[
                {
                    "role": "system",
                    "content": memory_content,
                },
                *user_message,
            ],
        )

        # Print assistant response
        assistant_response = llm_resp.choices[0].message.content
        print(f"3. Assistant Response: {assistant_response}")
        print("=" * 40)

        # Update memory with this interaction
        await mem_service.add_or_update_memory(
            user_id=user_id,
            user_input=user_message,
            assistant_response=llm_resp.choices[0].message,
        )
        await asyncio.sleep(1)  # Sleep for 1 second to avoid rate limiting

    print("\n--- Test sequence completed ---")


if __name__ == "__main__":
    asyncio.run(main())

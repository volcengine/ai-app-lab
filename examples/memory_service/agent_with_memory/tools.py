from typing import Any
from arkitect.core.component.memory.base_memory_service import BaseMemoryService

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
    Google Maps API to find commute duration.
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
    if "tanjong pagar" in end_address.lower():
        return {"duration": "30 mins", "distance": "15 km"}
    return {"duration": "unknown", "distance": "unknown"}


def web_search(key_words: str) -> dict[str, Any]:
    """
    Web search to find property comments or reviews.
    Args:
        property_name (str): Name of the property.
        address (str): Address of the property.
    Returns:
        dict: A dictionary containing found comments or a summary.
    """
    print(f"Tool: search_property_comments called for {key_words}")
    # Simulate web search
    if "Starville" in key_words:
        return {
            "summary": "Generally positive reviews, noted for good amenities but can be pricey."
        }
    return {"summary": "No specific comments found."}


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
You can use tools like web_search and get_commute_duration to find our more information.

If it does, explain briefly why. If it doesn't, explain what does not match.

Your response should be structured as:
Match: Yes/No
Explanation: [Brief explanation here]
"""
    print(base_instruction)
    return base_instruction

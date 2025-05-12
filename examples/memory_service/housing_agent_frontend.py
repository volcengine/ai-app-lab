import asyncio
import json
import os
from pathlib import Path
import httpx  # HTTP client library
from openai import AsyncOpenAI

# --- Configuration ---
BACKEND_AGENT_URL = (
    "http://localhost:10888/api/v3/bots"  # Matches the FastAPI server port
)
PROPERTY_LISTINGS_DIR = Path(__file__).parent / "data" / "crawled_listings"
USER_ID = "test_user_frontend"  # A unique ID for the frontend user


def make_classify_request(property_file_path: str) -> dict:
    with open(property_file_path, "r") as f:
        property_listing = f.read()
    return {
        "messages": [{"role": "user", "content": property_listing}],
        "model": "abc",
        "stream": True,
    }


def make_user_feedback_request(property_file_path: str, user_comment: str) -> dict:
    with open(property_file_path, "r") as f:
        property_listing = f.read()
    return {
        "messages": [
            {"role": "user", "content": property_listing},
            {"role": "user", "content": user_comment},
        ],
        "model": "abc",
        "stream": True,
    }


async def classify_and_recommend(property_file_path: str) -> str:
    client = AsyncOpenAI(
        # base_url="https://0x9hr6ko.fn.bytedance.net/api/v3/bots",  # remote
        base_url=BACKEND_AGENT_URL,
        api_key="{API_KEY}",
    )
    request_payload = make_classify_request(property_file_path)
    print(f"Querying agent for: {property_file_path.name}...")
    stream_resp = await client.chat.completions.create(**request_payload)
    thinking = False
    reasoning_ouput = ""
    output = ""
    async for chunk in stream_resp:
        if len(chunk.choices) == 0:
            if chunk.model_extra.get("bot_usage").get("action_details"):
                actions_detail = chunk.model_extra.get("bot_usage").get(
                    "action_details"
                )
                for action in actions_detail:
                    tool_details = action.get("tool_details")[0]
                    print(
                        f"\nCalling Tool {tool_details.get('name')} with input {tool_details.get('input')}"
                    )
                    if tool_details.get("output"):
                        print(
                            f"Tool {tool_details.get('name')} with output {tool_details.get('output')}"
                        )

        elif chunk.choices[0].delta.model_extra.get("reasoning_content"):
            if not thinking:
                print("\n----思考过程----\n")
                thinking = True
            content = chunk.choices[0].delta.model_extra.get("reasoning_content", "")
            reasoning_ouput += content
            print(content, end="", flush=True)
        elif chunk.choices[0].delta.content:
            if thinking:
                print("\n----输出回答----\n")
                thinking = False
            print(chunk.choices[0].delta.content, end="", flush=True)
            output += chunk.choices[0].delta.content

        elif chunk.choices[0].finish_reason:
            print("\n----输出回答----\n")
            thinking = False
            print(chunk.choices[0].finish_reason)
            print("\n")
            break
    print("=" * 40)
    return reasoning_ouput, output


async def update_user_profile(property_file_path: str, user_feedback: str) -> None:
    client = AsyncOpenAI(
        # base_url="URL_ADDRESSx9hr6ko.fn.bytedance.net/api/v3/bots",  # remote
        base_url=BACKEND_AGENT_URL,
        api_key="{API_KEY}",
    )
    request_payload = make_user_feedback_request(property_file_path, user_feedback)
    stream_resp = await client.chat.completions.create(**request_payload)
    async for chunk in stream_resp:
        continue


async def main():
    if not PROPERTY_LISTINGS_DIR.exists() or not PROPERTY_LISTINGS_DIR.is_dir():
        print(
            f"Error: Property listings directory not found at {PROPERTY_LISTINGS_DIR}"
        )
        return

    property_files = sorted(
        [
            f
            for f in PROPERTY_LISTINGS_DIR.iterdir()
            if f.is_file() and f.suffix == ".md"
        ]
    )

    if not property_files:
        print(f"No property markdown files found in {PROPERTY_LISTINGS_DIR}")
        return

    print(f"=== Starting Housing Evaluation Frontend for User: {USER_ID} ===")
    print(f"Found {len(property_files)} properties to evaluate.")
    print("=" * 40)

    for idx, property_file_path in enumerate(property_files):
        print(
            f"\n[Property {idx + 1}/{len(property_files)}: {property_file_path.name}]"
        )

        await classify_and_recommend(property_file_path)
        print(
            f"\nGet User feedback on this recommendation for {property_file_path.name}?"
        )
        user_feedback = input("Please feedback")
        await update_user_profile(property_file_path, user_feedback)
        print("=" * 40)
        await asyncio.sleep(1)

    print("\n--- All properties evaluated. Frontend session ended. ---")


if __name__ == "__main__":
    # Ensure the backend server (housing_agent_server.py) is running on http://localhost:8889
    # You might need to install httpx: pip install httpx
    asyncio.run(main())

import asyncio
import json
from pathlib import Path

from openai import AsyncOpenAI

# --- Configuration ---
BACKEND_AGENT_URL = (
    "http://localhost:10888/api/v3/bots"  # Matches the FastAPI server port
)
PROPERTY_LISTINGS_DIR = Path(__file__).parent / "data" / "crawled_listings"
USER_ID = "test_user_frontend"  # A unique ID for the frontend user


def make_classify_request(property_file_path: str, user_id: str) -> dict:
    with open(property_file_path, "r") as f:
        property_listing = f.read()
    return {
        "messages": [{"role": "user", "content": property_listing}],
        "model": "abc",
        "stream": True,
        "metadata": {"user_id": user_id},
    }


def make_inital_user_profile_setup(user_feedback: str, user_id: str) -> dict:
    return {
        "messages": [
            {"role": "user", "content": user_feedback},
        ],
        "model": "abc",
        "stream": True,
        "metadata": {"user_id": user_id},
    }


def make_user_feedback_request(
    property_file_path: str, user_comment: str, user_id: str, previous_response_id: str
) -> dict:
    with open(property_file_path, "r") as f:
        property_listing = f.read()
    return {
        "messages": [
            {"role": "user", "content": property_listing},
            {"role": "user", "content": user_comment},
        ],
        "model": "abc",
        "stream": True,
        "metadata": {"user_id": user_id, "previous_response_id": previous_response_id},
    }


async def classify_and_recommend(
    property_file_path: str, user_id: str
) -> tuple[str, str]:
    client = AsyncOpenAI(
        # base_url="https://0x9hr6ko.fn.bytedance.net/api/v3/bots",  # remote
        base_url=BACKEND_AGENT_URL,
        api_key="{API_KEY}",
    )
    request_payload = make_classify_request(property_file_path, user_id=user_id)
    print(f"Querying agent for: {property_file_path.name}...")
    stream_resp = await client.chat.completions.create(**request_payload)
    thinking = False
    reasoning_ouput = ""
    output = ""
    response = None
    async for chunk in stream_resp:
        print(chunk)
        if len(chunk.choices) == 0:
            if chunk.metadata.get("response"):
                response = chunk.metadata.get("response")
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
    print("\n\n" + "=" * 40)
    return reasoning_ouput, output, response


async def update_user_profile(
    property_file_path: str | None,
    user_feedback: str,
    user_id: str,
    previous_response_id: str | None = None,
) -> None:
    client = AsyncOpenAI(
        # base_url="URL_ADDRESSx9hr6ko.fn.bytedance.net/api/v3/bots",  # remote
        base_url=BACKEND_AGENT_URL,
        api_key="{API_KEY}",
    )
    if property_file_path is None:
        request_payload = make_inital_user_profile_setup(
            user_feedback=user_feedback, user_id=user_id
        )
    else:
        request_payload = make_user_feedback_request(
            property_file_path,
            user_feedback,
            user_id=user_id,
            previous_response_id=previous_response_id,
        )
    stream_resp = await client.chat.completions.create(**request_payload)
    async for chunk in stream_resp:
        continue


def store_to_file(file_path, output, reasoning_output):
    print("dumping file", file_path)
    o = {"reasoning_output": reasoning_output, "output": output}
    with open(file_path, "w") as f:
        json.dump(o, f)
    print("dumped file", file_path)


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
    initial_preference = "I want to rent a place near my office at Tanjong Pagar MRT."
    other_preferences = [
        "It need to be below 5000 budget per month and have 3 rooms.",
        "It would be great if it has a tennis court",
    ]
    await update_user_profile(
        property_file_path=None, user_feedback=initial_preference, user_id=USER_ID
    )

    for idx, property_file_path in enumerate(property_files):
        print(
            f"\n[Property {idx + 1}/{len(property_files)}: {property_file_path.name}]"
        )

        reasoning, output, response = await classify_and_recommend(
            property_file_path, USER_ID
        )
        previous_response_id = response.get("id", None)
        store_to_file(
            f"{property_file_path.name}.json",
            output,
            reasoning,
        )
        print(
            f"\nGet User feedback on this recommendation for {property_file_path.name}?"
        )
        # user_feedback = input("Please feedback:\n")
        if idx < len(other_preferences):
            user_feedback = other_preferences[idx]
        else:
            user_feedback = "no change"
        if user_feedback != "no change":
            await update_user_profile(
                property_file_path, user_feedback, USER_ID, previous_response_id
            )
        else:
            print("No change to user profile")
        print("\n\n" + "=" * 40)
        await asyncio.sleep(1)

    print("\n--- All properties evaluated. Frontend session ended. ---")


if __name__ == "__main__":
    # Ensure the backend server (housing_agent_server.py) is running on http://localhost:8889
    # You might need to install httpx: pip install httpx
    asyncio.run(main())

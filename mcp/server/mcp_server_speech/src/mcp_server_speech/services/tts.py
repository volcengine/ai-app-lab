import asyncio
import base64
import json
import logging
import time
import uuid  # For generating unique request IDs
from pathlib import Path

import requests  # Use requests library

from mcp_server_speech.config import (
    VOLC_APPID,
    VOLC_CLUSTER,
    VOLC_TOKEN,
    VOLC_VOICE_TYPE,
)
from mcp_server_speech.models import TtsInputArgs, TtsOutputResult

logger = logging.getLogger(__name__)

TTS_API_URL = "https://openspeech.bytedance.com/api/v1/tts"


def _make_sync_tts_request(reqid: str, args: TtsInputArgs) -> tuple[str | None, str]:
    """Synchronous function to make the TTS request using requests."""
    payload = {
        "app": {
            "appid": VOLC_APPID,
            "token": VOLC_TOKEN,
            "cluster": VOLC_CLUSTER,
        },
        "user": {"uid": "mcp_server_user"},  # Generic user ID for server-side requests
        "audio": {
            "voice_type": VOLC_VOICE_TYPE,
            "encoding": args.encoding,
            "speed_ratio": args.speed,
        },
        "request": {
            "reqid": reqid,
            "text": args.text,
            "operation": "query",
        },
    }
    headers = {
        "Authorization": f"Bearer;{VOLC_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            TTS_API_URL, headers=headers, json=payload, timeout=30
        )  # Add timeout
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)

        json_data = response.json()
        logger.info(f"TTS API response: {json_data}")

        # Check for API-level errors
        if json_data.get("code") != 3000:
            error_msg = f"TTS API returned an error: Code {json_data.get('code')}, Message: {json_data.get('message')}"
            logger.error(error_msg)
            raise ValueError(error_msg)

        audio_base64 = json_data.get("data")
        if not audio_base64:
            logger.error("TTS API response did not contain audio data.")
            raise ValueError("No audio data received from TTS API")

        return audio_base64, args.encoding

    except requests.exceptions.Timeout as err:
        logger.error(f"TTS API request timed out for reqid: {reqid}")
        raise TimeoutError("TTS API request timed out") from err
    except requests.exceptions.HTTPError as e:
        logger.error(
            f"TTS API HTTP error for reqid {reqid}: {e.response.status_code} {e.response.reason} - Response: {e.response.text}"
        )
        raise  # Re-raise the HTTPError
    except requests.exceptions.RequestException as e:
        logger.exception(f"Error during TTS request for reqid {reqid}: {e}")
        raise  # Re-raise other request exceptions
    except json.JSONDecodeError as e:
        logger.exception(
            f"Error decoding TTS API response for reqid {reqid}: {e} - Response: {response.text}"
        )
        raise ValueError("Invalid response format from TTS API") from e
    except Exception as e:
        logger.exception(
            f"An unexpected error occurred during synchronous TTS request for reqid {reqid}: {e}"
        )
        raise


# Keep the core logic separate
async def tts_request_handler(args: TtsInputArgs) -> TtsOutputResult:
    """
    Synthesizes text into speech using Bytedance API (via requests) and returns Base64 encoded audio data.
    Runs the synchronous requests call in a separate thread.
    """
    logger.info(
        f"Received TTS request for text: '{args.text[:50]}...' (format: {args.encoding})"  # Log truncated text, removed unused language
    )

    if not all([VOLC_APPID, VOLC_TOKEN]):
        raise ValueError("VOLC_APPID or VOLC_TOKEN is not configured.")

    reqid = str(uuid.uuid4())

    try:
        # Run the synchronous function in a thread pool executor
        audio_base64, output_format = await asyncio.to_thread(
            _make_sync_tts_request, reqid, args
        )

        # Decode the base64 audio data to mp3 and save it to a temporary file
        temp_dir = Path("temp")
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file_path = temp_dir / f"{int(time.time())}.mp3"
        with temp_file_path.open("wb") as temp_file:
            temp_file.write(base64.b64decode(audio_base64))

        logger.info(
            f"TTS successful: Request ID {reqid}, file path {temp_file_path.absolute()}, format: {output_format}"
        )
        return TtsOutputResult(
            file_path=Path(temp_file_path).absolute().as_posix(), format=output_format
        )

    except (ValueError, TimeoutError, requests.exceptions.RequestException) as e:
        # Log specific errors already handled in the sync function or asyncio wrapper
        logger.error(f"TTS request failed for reqid {reqid}: {e}")
        # Re-raise the specific error for potential handling upstream
        raise
    except Exception as e:
        # Catch any other unexpected errors during the async execution
        logger.exception(
            f"An unexpected error occurred during async TTS processing for reqid {reqid}: {e}"
        )
        raise  # Re-raise generic exceptions


if __name__ == "__main__":
    from mcp_server_speech.config import load_config

    # test _tts_logic
    def test_tts_logic():
        load_config()

        args = TtsInputArgs(
            text="Hello, this is a test.",
            speed=1.0,
            encoding="mp3",
        )
        result = asyncio.run(tts_request_handler(args))
        logger.info(f"Test result: {result}")

    test_tts_logic()

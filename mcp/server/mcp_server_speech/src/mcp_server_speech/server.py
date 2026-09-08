import logging
import os

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from mcp_server_speech.models import (
    AsrInputArgs,
    TtsInputArgs,
    TtsOutputResult,
)
from mcp_server_speech.services.asr import AsrService, AudioSourceType
from mcp_server_speech.services.tts import tts_request_handler

# Initialize FastMCP server
mcp = FastMCP("Speech MCP Server", port=int(os.getenv("PORT", "8000")))

logger = logging.getLogger(__name__)


@mcp.tool()
async def tts(
    text: str = Field(..., description="The text to synthesize into speech."),
    speed: float = Field(
        1.0, description="Speech speed (e.g., 1.0 for normal). default: 1.0."
    ),
    encoding: str = Field(
        "mp3",
        description="Desired audio output format (e.g., 'mp3', 'wav'). default: 'mp3'.",
    ),
) -> TtsOutputResult:
    """
    Text-to-Speech: Synthesizes text into audio.
    Return the path of audio file.
    """

    # Parameter validation logic
    if not text or text.strip() == "":
        raise ValueError("The text parameter cannot be empty.")
    if speed <= 0:
        raise ValueError("Speed must be a positive value.")
    if encoding not in ("mp3", "wav"):
        raise ValueError("Encoding must be either 'mp3' or 'wav'.")

    try:
        result = await tts_request_handler(
            TtsInputArgs(text=text, speed=speed, encoding=encoding)
        )

        return result
    except ValueError as e:
        logging.error(f"Value error in Text to Speech: {e}")
        raise
    except TimeoutError as e:
        logging.error(f"Timeout error in Text to Speech: {e}")
        raise
    except Exception as e:
        logging.error(f"Error Text to Speech: {e}")
        raise


@mcp.tool()
async def asr(
    content: str = Field(
        ...,
        description="url or absolute path of the audio file to transcribe.",
    ),
) -> str:
    """
    Automatic Speech Recognition: Converts audio to text.
    """

    # Parameter validation logic
    if not content or content.strip() == "":
        raise ValueError("The content parameter cannot be empty.")

    try:
        service = AsrService()
        source_type = service.detect_source_type(content)  # Detect source type
        result = None
        options = None

        if mcp.transport == "sse" and source_type == AudioSourceType.FILE:
            return "Error: SSE transport does not support file input."

        if mcp.transport == "stdio":
            options = {"format": "mp3", "rate": 16000, "channel": 1, "bits": 16}

        result = await service.recognize(
            AsrInputArgs(source=content, source_type=source_type, options=options)
        )

        logger.info(f"asr result: {result}")

        return result.text

    except ValueError as e:
        logging.error(f"Value error in Automatic Speech Recognition: {e}")
        raise
    except TimeoutError as e:
        logging.error(f"Timeout error in Automatic Speech Recognition: {e}")
        raise
    except Exception as e:
        logging.error(f"Error Automatic Speech Recognition: {e}")
        raise

from enum import Enum

from pydantic import BaseModel, Field

# --- Pydantic Models for Tool Inputs/Outputs ---


class AudioSourceType(Enum):
    URL = "url"
    FILE = "file"


class AsrInputArgs(BaseModel):
    """Arguments for the ASR tool."""

    source: str = Field(
        ..., description="Path to the audio file or URL of the audio stream."
    )
    source_type: AudioSourceType = Field(
        ..., description="Type of the audio source (e.g., 'file', 'url')."
    )
    options: dict | None = Field(
        None, description="Additional options for ASR processing."
    )


class AsrOutputResult(BaseModel):
    """Output of the ASR tool."""

    text: str = Field(..., description="The recognized text from the audio.")


class TtsInputArgs(BaseModel):
    """Arguments for the TTS tool."""

    text: str = Field(..., description="The text to synthesize into speech.")
    speed: float = Field(1.0, description="Speech speed (e.g., 1.0 for normal).")
    encoding: str = Field(
        "mp3", description="Desired audio output format (e.g., 'mp3', 'wav')."
    )


class TtsOutputResult(BaseModel):
    """Output of the TTS tool."""

    format: str = Field(
        ..., description="The format of the audio data (e.g., 'mp3', 'wav')."
    )
    file_path: str = Field(
        "", description="The path to the saved audio file (if applicable)."
    )

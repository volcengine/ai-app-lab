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

from abc import ABC
from typing import Optional

from pydantic import BaseModel, Field

# Define event types
BOT_READY = "BotReady"
BOT_UPDATE_CONFIG = "BotUpdateConfig"
USER_AUDIO = "UserAudio"
SENTENCE_RECOGNIZED = "SentenceRecognized"
TTS_SENTENCE_START = "TTSSentenceStart"
TTS_SENTENCE_END = "TTSSentenceEnd"
TTS_DONE = "TTSDone"
BOT_ERROR = "BotError"
CONNECTION_CLOSED = "ConnectionClosed"


class WebPayload(ABC):
    """
    Abstract base class for web payloads.
    """

    pass


# Define error event
class ErrorEvent(BaseModel):
    """
    Model for error events.

    Attributes:
        code (str): The error code.
        message (str): The error message.
    """

    code: str
    message: str


# Define payloads
class BotReadyPayload(WebPayload, BaseModel):
    """
    Payload for the BotReady event.

    Attributes:
        session (str): The session ID.
    """

    session: str


class BotUpdateConfigPayload(WebPayload, BaseModel):
    """
    Payload for the BotUpdateConfig event.

    Attributes:
        speaker (Optional[str]): The speaker ID.
    """

    speaker: Optional[str] = None


class SentenceRecognizedPayload(WebPayload, BaseModel):
    """
    Payload for the SentenceRecognized event.

    Attributes:
        sentence (str): The recognized sentence.
    """

    sentence: str


class TTSSentenceStartPayload(WebPayload, BaseModel):
    """
    Payload for the TTSSentenceStart event.

    Attributes:
        sentence (str): The sentence to be spoken.
    """

    sentence: str


class TTSSentenceEndPayload(WebPayload, BaseModel):
    """
    Payload for the TTSSentenceEnd event.

    Attributes:
        data (bytes): The audio data.
    """

    data: bytes


class TTSDonePayload(WebPayload, BaseModel):
    """
    Payload for the TTSDone event.
    """

    pass


class BotErrorPayload(WebPayload, BaseModel):
    """
    Payload for the BotError event.

    Attributes:
        error (ErrorEvent): The error event.
    """

    error: ErrorEvent = Field(default_factory=ErrorEvent)


# Define WebEvent
class WebEvent(BaseModel):
    """
    Model for web events.

    Attributes:
        event (str): The event type.
        payload (Optional[WebPayload]): The event payload.
        data (Optional[bytes]): The event data.
    """

    event: str
    payload: Optional[WebPayload] = None
    data: Optional[bytes] = None

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    @classmethod
    def from_payload(cls, payload: WebPayload):
        """
        Create a WebEvent instance from a payload.

        Args:
            payload (WebPayload): The event payload.

        Returns:
            WebEvent: The created WebEvent instance.

        Raises:
            ValueError: If the payload type is invalid.
        """
        if isinstance(payload, BotReadyPayload):
            return cls(event=BOT_READY, payload=payload)
        elif isinstance(payload, BotUpdateConfigPayload):
            return cls(event=BOT_UPDATE_CONFIG, payload=payload)
        elif isinstance(payload, SentenceRecognizedPayload):
            return cls(event=SENTENCE_RECOGNIZED, payload=payload)
        elif isinstance(payload, TTSSentenceStartPayload):
            return cls(event=TTS_SENTENCE_START, payload=payload)
        elif isinstance(payload, TTSSentenceEndPayload):
            return cls(event=TTS_SENTENCE_END, data=payload.data)
        elif isinstance(payload, TTSDonePayload):
            return cls(event=TTS_DONE)
        elif isinstance(payload, BotErrorPayload):
            return cls(event=BOT_ERROR, payload=payload)
        else:
            raise ValueError("Invalid payload type")

# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import asyncio
import uuid
from typing import Any, AsyncIterable, Optional, Union

import websockets

from arkitect.core.component.tts.base import AsyncBaseTTSClient, TTSResponseChunk
from arkitect.core.component.tts.constants import (
    NAMESPACE,
    EventFinishSession,
    EventStartConnection,
    EventStartSession,
    EventTaskRequest,
    EventTTSSentenceStart,
)
from arkitect.core.component.tts.model import (
    ConnectionParams,
    Message,
    ResponseEvent,
    TextRequest,
    TTSRequest,
)
from arkitect.core.component.tts.utils import parse_response
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR, INFO
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import ArkChatCompletionChunk, ArkChatResponse

__all__ = ["AsyncTTSClient"]


class AsyncTTSClient(AsyncBaseTTSClient):
    def __init__(
        self,
        access_key: str,
        app_key: str,
        connection_params: ConnectionParams,
        api_resource_id: str = "volc.service_type.10029",
        conn_id: str = str(uuid.uuid4()),
        log_id: str = str(uuid.uuid4()),
        base_url: str = "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
    ):
        self.api_resource_id = api_resource_id
        self.access_key = access_key
        self.app_key = app_key
        self.conn_id = conn_id
        self.log_id = log_id
        self.base_url = base_url

        self.conn: Optional[websockets.WebSocketClientProtocol] = None
        self.session_id: Optional[str] = None
        self.connection_params: ConnectionParams = connection_params
        self.inited = False

    async def init(
        self,
        namespace: str = NAMESPACE,
    ) -> None:
        headers = self._build_http_header()
        INFO("with logID: %s , header: %s", self.log_id, headers)
        self.conn = await websockets.connect(self.base_url, extra_headers=headers)
        INFO("Dial server with LogID: %s", self.log_id)
        # Create a new message with type MsgTypeFullClient and flag MsgTypeFlagWithEvent
        msg = Message(event=EventStartConnection)
        frame = msg.write_start_connection()
        await self._send_frame(frame)
        # Read ConnectionStarted message
        response = await self.conn.recv()
        parse_response(response)
        await self._start_tts_session(
            namespace=namespace,
            params=self.connection_params,
        )
        self.inited = True

    async def reset_conn(self) -> None:
        await self.close()
        await self.init()
        INFO("TTS Reset connection")

    async def _start_tts_session(
        self, namespace: str, params: ConnectionParams
    ) -> ResponseEvent:
        msg = Message(
            connection_id=self.conn_id,
            event=EventStartSession,
        )
        # Marshal the message into a binary frame
        p = params.model_dump(mode="json")
        session_config = {
            "event": EventStartSession,
            "namespace": namespace,
            "req_params": p,
        }
        msg.payload = session_config
        frame = msg.write_start_tts_session()
        await self._send_frame(frame)
        if self.conn is None:
            raise ValueError("TTS connection is not established")
        response = await self.conn.recv()
        result = parse_response(response)
        self.session_id = result.session_id
        return result

    async def _send_text_data(self, data: TextRequest) -> None:
        req_params = self.connection_params.model_dump(mode="json")
        req_params["text"] = data.text
        req = TTSRequest(
            event=EventTaskRequest,
            req_params=req_params,
        )
        msg = Message(
            event=EventTaskRequest,
            session_id=self.session_id,
        )
        msg.payload = req.model_dump(mode="json")
        # Marshal the message into a binary frame
        frame = msg.write_text_request()
        await self._send_frame(frame)
        if data.finished:
            await self._send_finish_session()

    async def _send_frame(self, frame: bytes) -> None:
        if self.conn is None:
            raise ValueError("Connection is not established")
        await self.conn.send(frame)

    async def _send_finish_session(self) -> None:
        msg = Message(
            event=EventFinishSession,
            session_id=self.session_id,
        )
        msg.payload = {}
        frame = msg.write_finish_session()
        await self._send_frame(frame)

    async def _receive_data(self) -> ResponseEvent:
        if self.conn is None:
            raise ValueError("Connection is not established")
        response = await self.conn.recv()
        result = parse_response(response)
        return result

    async def _receive_audio_data(self) -> ResponseEvent:
        if self.conn is None:
            raise ValueError("Connection is not established")
        # Implement the receive audio data logic here
        while True:
            response = await self.conn.recv()
            result = parse_response(response)
            if result.audio_only or result.session_finished:
                return result

    async def close(self) -> None:
        if self.conn is not None:
            await self.conn.close()
            self.conn = None
        self.inited = False

    def _build_http_header(self) -> dict:
        headers = {
            "X-Tt-Logid": self.log_id,
            "X-Api-Resource-Id": self.api_resource_id,
            "X-Api-Access-Key": self.access_key,
            "X-Api-App-Key": self.app_key,
            "X-Api-Connect-Id": self.conn_id,
        }
        return headers

    async def _get_tts_stream(
        self,
        include_transcript: bool,
    ) -> AsyncIterable[TTSResponseChunk]:
        """

        A tts stream consist of interleaving audio and transcript.
        The sequence is as follow
        <TRANSCRIPT 1> <AUDIO 1> <AUDIO 1> ... <TRANSCRIPT 1>
        <TRANSCRIPT 2> <AUDIO 2> <AUDIO 2> ...<TRANSCRIPT 2>

        Each sentence of transcript will be returned twice,
        indicating the start and end of its corresponding andio chunks.
        We remove the second transcript chunk to avoid duplicate
        """
        while True:
            response = await self._receive_data()
            if response.audio_only:
                yield TTSResponseChunk(event=response.event, audio=response.audio)
            if response.session_finished:
                yield TTSResponseChunk(event=response.event)
                break
            if response.event == EventTTSSentenceStart and include_transcript:
                transcript = response.payload_msg.get("text", "")
                yield TTSResponseChunk(event=response.event, transcript=transcript)
            else:
                yield TTSResponseChunk(event=response.event)

    async def tts(  # type: ignore
        self,
        source: Union[
            AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse, str]], str
        ],
        stream: bool = True,
        **kwargs: Any,
    ) -> AsyncIterable[TTSResponseChunk]:
        try:
            if not self.inited:
                await self.init()
            include_transcript: bool = kwargs.get("include_transcript", True)

            @task()
            async def send_text_to_tts(
                text_stream: Union[
                    AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse, str]],
                    str,
                ],
            ) -> None:
                if isinstance(source, str):
                    await self._send_text_data(
                        TextRequest(
                            text=source,
                            finished=True,
                        )
                    )
                else:
                    async for resp in text_stream:  # type: ignore
                        if isinstance(resp, ArkChatCompletionChunk):
                            text = resp.choices[0].delta.content
                        elif isinstance(resp, ArkChatResponse):
                            text = resp.choices[0].message.content
                        elif isinstance(resp, str):
                            text = resp
                        else:
                            raise InvalidParameter(f"Invalid type: {type(resp)}")
                        await self._send_text_data(
                            TextRequest(
                                text=text,
                                finished=False,
                            )
                        )
                    await self._send_finish_session()

            t = asyncio.create_task(send_text_to_tts(text_stream=source))
            audio_part: bytes = b""
            audio_transcript: str = ""
            async for chunk in self._get_tts_stream(include_transcript):
                if stream:
                    yield chunk
                if chunk.audio:
                    audio_part += chunk.audio
                if chunk.transcript:
                    audio_transcript += chunk.transcript
            if not stream:
                yield TTSResponseChunk(audio=audio_part, transcript=audio_transcript)
            await t
            await self.close()
        except Exception as e:
            ERROR(str(e))
        finally:
            await self.close()

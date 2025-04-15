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
import gzip
import struct
import uuid
from abc import ABC, abstractmethod
from typing import Any, AsyncIterable, Optional

import websockets

from arkitect.core.component.asr.constants import DEFAULT_ASR_AUDIO
from arkitect.core.component.asr.model import (
    ASRAudio,
    ASRAudioInfoRsp,
    ASRAudioOnlyRequest,
    ASRFullClientRequest,
    ASRFullServerResponse,
    ASRRequest,
    ASRResult,
    ASRUser,
)
from arkitect.telemetry.logger import INFO
from arkitect.telemetry.trace import task
from arkitect.utils.binary_protocol import (  # type: ignore
    AUDIO_ONLY_REQUEST,
    NO_SEQUENCE,
    POS_SEQUENCE,
    generate_before_payload,
    generate_header,
    parse_response,
)

__all__ = ["BaseAsyncASRClient", "AsyncASRClient"]


class BaseAsyncASRClient(ABC):
    @abstractmethod
    async def init(self) -> None:
        pass

    @abstractmethod
    async def reset_conn(self) -> None:
        pass

    @abstractmethod
    async def stream_asr(
        self, stream_audio: AsyncIterable[bytes], **kwargs: Any
    ) -> AsyncIterable[ASRFullServerResponse]:
        pass

    @abstractmethod
    async def close(self) -> None:
        pass


class AsyncASRClient(BaseAsyncASRClient, ABC):
    def __init__(
        self,
        access_key: str,
        app_key: str,
        api_resource_id: str = "volc.bigasr.sauc.duration",
        conn_id: str = str(uuid.uuid4()),
        log_id: str = str(uuid.uuid4()),
        base_url: str = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        audio_format: ASRAudio = DEFAULT_ASR_AUDIO,
        user: Optional[ASRUser] = None,
        model_name: str = "bigmodel",
    ):
        self.api_resource_id = api_resource_id
        self.access_key = access_key
        self.app_key = app_key
        self.conn_id = conn_id
        self.log_id = log_id

        self.base_url = base_url
        self.audio_format = audio_format
        self.user = user
        self.model_name = model_name

        self.conn: Optional[websockets.WebSocketClientProtocol] = None  # type: ignore
        self.session_id: Optional[str] = None
        self.inited = False

    async def init(self) -> None:
        if self.inited:
            return
        # init ws conn
        headers = {
            "X-Api-Resource-Id": self.api_resource_id,
            "X-Api-Access-Key": self.access_key,
            "X-Api-App-Key": self.app_key,
            "X-Api-Request-Id": self.log_id,
        }

        self.conn = await websockets.connect(self.base_url, additional_headers=headers)
        INFO(f"Connected to {self.base_url}, log_id: {self.log_id}")

        # send init response
        init_response = await self._send_full_client_request(
            ASRFullClientRequest(
                user=self.user,
                audio=self.audio_format,
                request=ASRRequest(model_name=self.model_name),
            )
        )

        INFO(f"Inited asr client: {init_response}")
        self.inited = True

    async def reset_conn(self) -> None:
        if self.conn:
            await self.conn.close()
            self.inited = False
        await self.init()
        INFO("Reset ASR Connection")

    async def stream_asr(  # type: ignore
        self, stream_audio: AsyncIterable[bytes], **kwargs: Any
    ) -> AsyncIterable[Optional[ASRFullServerResponse]]:
        """
        Streams audio data to the ASR server and yields responses as they are received.
        """

        @task()
        async def send_audio_task(
            audio_stream: AsyncIterable[bytes],
        ) -> None:
            # i = 1
            async for data in audio_stream:
                await self._send_audio(
                    audio_only_request=ASRAudioOnlyRequest(
                        last_package=False,
                        seq=0,
                        audio=data,
                    )
                )
                # i += 1

        @task()
        async def receive_response_task() -> AsyncIterable[ASRFullServerResponse]:
            while True:
                if not self.inited:
                    INFO("ASR client is disconnected, skip the audio input.")
                    await asyncio.sleep(1)
                    continue
                response = await self._receive_response()
                INFO(f"Received asr server response: {response}")
                yield response  # type: ignore

        t = asyncio.create_task(send_audio_task(audio_stream=stream_audio))

        async for rsp in receive_response_task():
            yield rsp

        await t

    async def close(self) -> None:
        if self.conn is not None:
            await self.conn.close()
            self.conn = None
        self.inited = False

    @task()
    async def _send_full_client_request(
        self, full_client_request: ASRFullClientRequest
    ) -> ASRFullServerResponse:
        payload_bytes = str.encode(
            full_client_request.model_dump_json(exclude_none=True, exclude_unset=True)
        )
        payload_bytes = gzip.compress(payload_bytes)
        full_client_bytes = bytearray(
            generate_header(message_type_specific_flags=POS_SEQUENCE)
        )
        full_client_bytes.extend(generate_before_payload(sequence=1))
        full_client_bytes.extend(
            (len(payload_bytes)).to_bytes(4, "big")
        )  # payload size(4 bytes)
        full_client_bytes.extend(payload_bytes)
        # payload

        await self.conn.send(full_client_bytes)  # type: ignore
        res = await self.conn.recv()  # type: ignore
        return ASRFullServerResponse(**parse_response(res))

    @task(watch_io=False)
    async def _send_audio(self, audio_only_request: ASRAudioOnlyRequest) -> None:
        if not self.conn or not self.inited:
            # connection is closed.
            INFO("ASR Conn is closed, will ignore the audio.")
            return
        payload_bytes = gzip.compress(audio_only_request.audio)
        audio_only_bytes = bytearray(
            generate_header(
                message_type=AUDIO_ONLY_REQUEST, message_type_specific_flags=NO_SEQUENCE
            )
        )
        audio_only_bytes.extend(struct.pack(">I", len(payload_bytes)))
        audio_only_bytes.extend(payload_bytes)  # payload
        await self.conn.send(audio_only_bytes)
        INFO(f"Sent Data INFO ASR SERVER data len={len(payload_bytes)}")

    async def _receive_response(self) -> Optional[ASRFullServerResponse]:
        if not self.conn:
            # connection is closed.
            return None
        res = await self.conn.recv()
        parsed_res = parse_response(res)
        # print(parsed_res)
        return ASRFullServerResponse(
            sequence=parsed_res.get("payload_sequence"),
            last_package=parsed_res.get("is_last_package", False),
            result=ASRResult(**parsed_res.get("payload_msg", {}).get("result", {})),
            audio=ASRAudioInfoRsp(
                **parsed_res.get("payload_msg", {}).get("audio_info", {})
            ),
        )

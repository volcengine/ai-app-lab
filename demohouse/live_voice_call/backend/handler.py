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

import asyncio
import logging
import uuid
from typing import AsyncIterable

import websockets

from arkitect.telemetry.logger import INFO
from arkitect.utils.event_loop import get_event_loop
from service import VoiceBotService
from utils import *

# replace with your asr API access
ASR_ACCESS_TOKEN = "{YOUR_ASR_ACCESS_TOKEN}"
ASR_APP_ID = "{YOUR_ASR_APP_ID}"
# replace with your tts API access
TTS_ACCESS_TOKEN = "{YOUR_TTS_ACCESS_TOKEN}"
TTS_APP_ID = "{YOUR_TTS_APP_ID}"
# replace with your ark endpoint
LLM_ENDPOINT_ID = "{YOUR_ARK_LLM_ENDPOINT_ID}"

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


async def handler(websocket: websockets.WebSocketCommonProtocol, path):
    """
    Asynchronous function to handle WebSocket connections.

    Args:
        websocket (websockets.WebSocketCommonProtocol): The client's WebSocket connection.
        path (str): The requested path.
    """
    # Create a VoiceBotService instance and initialize it
    service = VoiceBotService(
        llm_ep_id=LLM_ENDPOINT_ID,
        tts_app_key=TTS_APP_ID,
        tts_access_key=TTS_ACCESS_TOKEN,
        asr_app_key=ASR_APP_ID,
        asr_access_key=ASR_ACCESS_TOKEN,
    )
    await service.init()
    # Send a bot ready message
    await websocket.send(
        convert_web_event_to_binary(
            WebEvent.from_payload(BotReadyPayload(session=str(uuid.uuid4())))
        )
    )

    async def async_gen(
        ws: websockets.WebSocketCommonProtocol,
    ) -> AsyncIterable[WebEvent]:
        """
        Asynchronously generate input events from the WebSocket connection.

        Args:
            ws (websockets.WebSocketCommonProtocol): The client's WebSocket connection.

        Returns:
            AsyncIterable[WebEvent]: An asynchronous generator of input events.
        """
        async for m in ws:
            input_event = convert_binary_to_web_event_to_binary(m)
            INFO(
                f"Received input event: {input_event.event}, \
                payload: {input_event.event}, data len:{len(input_event.data)}"
            )
            yield input_event

    async def fetch_output(
        ws: websockets.WebSocketCommonProtocol, output_events: AsyncIterable[WebEvent]
    ) -> None:
        """
        Asynchronously fetch and send output events to the WebSocket connection.

        Args:
            ws (websockets.WebSocketCommonProtocol): The client's WebSocket connection.
            output_events (AsyncIterable[WebEvent]): An asynchronous generator of output events.
        """
        async for output_event in output_events:
            INFO(
                f"Sending output event= {output_event.event}, \
                data len:{len(output_event.data) if output_event.data else 0} , payload: {output_event.payload}"
            )
            await ws.send(convert_web_event_to_binary(output_event))

    INFO(f"New connection: {websocket.remote_address}")
    try:
        # Start the handler loop and asynchronously fetch output events
        outputs = service.handler_loop(async_gen(websocket))
        await asyncio.create_task(fetch_output(websocket, outputs))
    except websockets.exceptions.ConnectionClosed as e:
        INFO(f"Connection closed: {e}")


async def main():
    """
    Main function to start the WebSocket server.
    """
    # Start the WebSocket server listening on 127.0.0.1:8888
    server = await websockets.serve(handler, host="127.0.0.1", port=8888)
    INFO("WebSocket server is running on ws://127.0.0.1:8888")
    await server.wait_closed()


if __name__ == "__main__":
    get_event_loop(main())

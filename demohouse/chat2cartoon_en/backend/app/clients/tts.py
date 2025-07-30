import gzip
import json
import struct
import uuid
from typing import Optional

import websockets
from pydantic import BaseModel

from app.constants import TTS_NAMESPACE, TTS_INT_SIZE, TTS_DEFAULT_SPEAKER, TTS_BASE_URL, TTS_API_RESOURCE_ID, \
    TTS_ACCESS_KEY, TTS_APP_KEY
from app.logger import INFO

PROTOCOL_VERSION = 0b0001
DEFAULT_HEADER_SIZE = 0b0001

# Message Type:
FULL_CLIENT_REQUEST = 0b0001
AUDIO_ONLY_REQUEST = 0b0010
FULL_SERVER_RESPONSE = 0b1001
SERVER_ACK = 0b1011
SERVER_ERROR_RESPONSE = 0b1111

# Message Type Specific Flags
NO_SEQUENCE = 0b0000  # no check sequence
POS_SEQUENCE = 0b0001
NEG_SEQUENCE = 0b0010
NEG_WITH_SEQUENCE = 0b0011
NEG_SEQUENCE_1 = 0b0011

# Message Serialization
NO_SERIALIZATION = 0b0000
JSON = 0b0001

# Message Compression
NO_COMPRESSION = 0b0000
GZIP = 0b0001

# 默认事件,对于使用事件的方案，可以通过非0值来校验事件的合法性
EventNone = 0

EventStartConnection = 1
EventFinishConnection = 2

EventConnectionStarted = 50
EventConnectionFailed = 51
EventConnectionFinished = 52

EventStartSession = 100
EventFinishSession = 102

EventSessionStarted = 150
EventSessionFinished = 152
EventSessionFailed = 153

EventTaskRequest = 200

EventTTSSentenceStart = 350
EventTTSSentenceEnd = 351
EventTTSResponse = 352

CONTAIN_EVENT = 4


class TextRequest(BaseModel):
    text: str
    finished: bool


class TTSRequest(BaseModel):
    event: int
    namespace: str = TTS_NAMESPACE
    req_params: dict


class ResponseEvent(BaseModel):
    audio_only: bool = False
    session_finished: bool = False
    session_id: Optional[str] = None
    connection_id: Optional[str] = None
    payload_msg: dict = {}
    payload_size: int = 0

    audio: bytes = b""


# Error messages as exceptions
class ProtocolError(Exception):
    pass


# Message Types
class MsgType:
    INVALID = 0
    FULL_CLIENT = 1
    AUDIO_ONLY_CLIENT = 2
    FULL_SERVER = 3
    AUDIO_ONLY_SERVER = 4
    FRONT_END_RESULT_SERVER = 5
    ERROR = 6
    SERVER_ACK = AUDIO_ONLY_SERVER

    @staticmethod
    def to_string(msg_type):
        return {
            MsgType.FULL_CLIENT: "FullClient",
            MsgType.AUDIO_ONLY_CLIENT: "AudioOnlyClient",
            MsgType.FULL_SERVER: "FullServer",
            MsgType.AUDIO_ONLY_SERVER: "AudioOnlyServer/ServerACK",
            MsgType.FRONT_END_RESULT_SERVER: "TtsFrontEndResult",
            MsgType.ERROR: "Error",
        }.get(msg_type, f"invalid message type: {msg_type}")

    @staticmethod
    def bits_to_type(bits):
        return {
            0b00010000: MsgType.FULL_CLIENT,
            0b00100000: MsgType.AUDIO_ONLY_CLIENT,
            0b10010000: MsgType.FULL_SERVER,
            0b10110000: MsgType.AUDIO_ONLY_SERVER,
            0b11000000: MsgType.FRONT_END_RESULT_SERVER,
            0b11110000: MsgType.ERROR,
        }.get(bits, MsgType.ERROR)


# Bit Definitions
class MsgTypeFlagBits:
    NO_SEQ = 0
    POSITIVE_SEQ = 0b1
    LAST_NO_SEQ = 0b10
    NEGATIVE_SEQ = 0b11
    WITH_EVENT = 0b100


# Message Class
class Message:
    def __init__(
            self,
            message_type=MsgType.FULL_CLIENT,
            type_flag=MsgTypeFlagBits.WITH_EVENT,
            session_id: str = None,
            event=None,
            connection_id: str = None,
    ):
        self.type_and_flag_bits = message_type << 4 | type_flag
        self.msg_type = None
        self.event = event
        self.session_id: str = session_id
        self.connection_id: str = connection_id
        self.sequence = None
        self.error_code = None
        self.payload: BaseModel = None

    def type_flag(self):
        return self.type_and_flag_bits & 0b00001111

    def write_start_connection(self):
        return _write_message(event=self.event, payload="{}")

    def write_start_tts_session(self):
        return _write_message(
            event=self.event,
            connection_id=self.connection_id,
            payload=json.dumps(self.payload),
        )

    def write_text_request(self):
        return _write_message(
            event=self.event,
            session_id=self.session_id,
            payload=json.dumps(self.payload),
        )

    def write_finish_session(self):
        return _write_message(
            event=self.event,
            session_id=self.session_id,
            payload=json.dumps(self.payload),
        )


# BinaryProtocol Class
class BinaryProtocol:
    def __init__(self):
        self.version_and_header_size = 0
        self.serialization_and_compression = 0
        self.contains_sequence = contains_sequence
        self.compress_func = None
        self.set_version(0b1)
        self.set_header_size(0b1)
        self.set_serialization(0b1)

    def set_version(self, version):
        self.version_and_header_size = (self.version_and_header_size & 0b00001111) | (
                version << 4
        )

    def set_header_size(self, header_size):
        self.version_and_header_size = (
                                               self.version_and_header_size & 0b11110000
                                       ) | header_size

    def set_serialization(self, serialization):
        self.serialization_and_compression = (
                                                     self.serialization_and_compression & 0b00001111
                                             ) | (serialization << 4)

    def set_compression(self, compression, compress_func=None):
        self.serialization_and_compression = (
                                                     self.serialization_and_compression & 0b11110000
                                             ) | compression
        self.compress_func = compress_func

    def marshal(self, msg: Message):
        header = self.create_header(msg)
        payload = (
            msg.payload
            if self.compress_func is None
            else self.compress_func(msg.payload)
        )
        return header + payload

    def create_header(self, msg: Message):
        header = bytearray(
            [
                self.version_and_header_size,
                msg.type_and_flag_bits,
                self.serialization_and_compression,
            ]
        )
        padding_size = self.get_header_size() - len(header)
        if padding_size > 0:
            header.extend([0] * padding_size)
        return header

    def get_header_size(self):
        return 4 * (self.version_and_header_size & 0b00001111)


class TTSClient:
    def __init__(
            self,
            speaker=TTS_DEFAULT_SPEAKER,
            conn_id=str(uuid.uuid4()),
            log_id=str(uuid.uuid4()),
    ):
        self.conn_id = conn_id
        self.log_id = log_id
        self.conn = None
        self.sequence = 0
        self.conn = None
        self.session_id = ""
        self.speaker: str = speaker
        self.params = {}

    async def start_connection(
            self,
            params: dict,
            namespace: str = TTS_NAMESPACE,
    ):
        headers = self.build_http_header(self.conn_id, self.log_id)
        INFO("with logID: %s , header: %s", self.log_id, headers)
        self.conn = await websockets.connect(TTS_BASE_URL, extra_headers=headers)
        self.params = params
        INFO("Dial server with LogID: %s", self.log_id)
        # Create a new message with type MsgTypeFullClient and flag MsgTypeFlagWithEvent
        msg = Message(event=EventStartConnection)
        payload = msg.write_start_connection()
        # Marshal the message into a binary frame
        frame = BinaryProtocol().create_header(msg) + payload
        await self.conn.send(frame)
        # Read ConnectionStarted message
        response = await self.conn.recv()
        result = parse_response(response)
        INFO("received %s", result)
        await self._start_tts_session(namespace=namespace, params=params)

    async def _start_tts_session(self, namespace, params):
        msg = Message(
            connection_id=self.conn_id,
            session_id=self.session_id,
            event=EventStartSession,
        )
        params["speaker"] = self.speaker
        # Marshal the message into a binary frame
        session_config = {
            "event": EventStartSession,
            "namespace": namespace,
            "req_params": params,
        }
        msg.payload = session_config
        frame = BinaryProtocol().create_header(msg) + msg.write_start_tts_session()
        await self.conn.send(frame)
        # Implement the start TTS session logic here
        response = await self.conn.recv()
        result = parse_response(response)
        self.session_id = result.session_id
        return result

    async def send_text_data(self, data: TextRequest):
        req_params = self.params
        req_params["text"] = data.text
        req_params["speaker"] = self.speaker
        req = TTSRequest(
            event=EventTaskRequest,
            req_params=req_params,
        )
        # Create a new message with type MsgTypeAudioOnly and flag MsgTypeFlagWithSequence
        msg = Message(
            event=EventTaskRequest,
            session_id=self.session_id,
        )
        msg.payload = req.model_dump(mode="json")
        # Marshal the message into a binary frame
        frame = BinaryProtocol().create_header(msg) + msg.write_text_request()
        await self.conn.send(frame)
        if data.finished:
            await self.send_finish_session()

    async def send_finish_session(self):
        msg = Message(
            event=EventFinishSession,
            session_id=self.session_id,
        )
        msg.payload = {}
        frame = BinaryProtocol().create_header(msg) + msg.write_finish_session()
        await self.conn.send(frame)

    async def receive_data(self) -> ResponseEvent:
        response = await self.conn.recv()
        result = parse_response(response)
        return result

    async def receive_audio_data(self) -> ResponseEvent:
        # Implement the receive audio data logic here
        while True:
            response = await self.conn.recv()
            result = parse_response(response)
            if result.audio_only or result.session_finished:
                return result

    async def tts(self, data: TextRequest):
        await self.send_text_data(data)
        output_audio = b""
        while True:
            response = await self.receive_audio_data()
            if response.audio_only:
                output_audio += response.audio
            if response.session_finished:
                return output_audio

    async def close(self, *args, **kwargs):
        await self.conn.close(*args, **kwargs)

    def build_http_header(self, conn_id, log_id):
        headers = {
            "X-Tt-Logid": log_id,
            "X-Api-Resource-Id": TTS_API_RESOURCE_ID,
            "X-Api-Access-Key": TTS_ACCESS_KEY,
            "X-Api-App-Key": TTS_APP_KEY,
            "X-Api-Connect-Id": conn_id,
        }
        return headers


def parse_response(res) -> ResponseEvent:
    """
    protocol_version(4 bits), header_size(4 bits),
    message_type(4 bits), message_type_specific_flags(4 bits)
    serialization_method(4 bits) message_compression(4 bits)
    reserved （8bits) 保留字段
    header_extensions 扩展头(大小等于 8 * 4 * (header_size - 1) )
    payload 类似与http 请求体
    """
    header_size = res[0] & 0x0F
    message_type_specific_flags = res[1] & 0x0F
    serialization_method = res[2] >> 4
    message_compression = res[2] & 0x0F
    ptr = header_size * 4
    result = ResponseEvent()
    if contain_event(message_type_specific_flags):
        event = int.from_bytes(res[ptr: ptr + TTS_INT_SIZE], "big", signed=True)
        ptr += 4
        if event == EventSessionFinished:
            result.session_finished = True
        if event != 1 and event != 2 and event != 50 and event != 51 and event != 52:
            session_id_len = int.from_bytes(
                res[ptr: ptr + TTS_INT_SIZE], "big", signed=False
            )
            ptr += 4
            session_id = res[ptr: ptr + session_id_len]
            ptr += session_id_len
            result.session_id = session_id.decode("utf-8")
        if event in [50, 51, 52]:
            connection_id_len = int.from_bytes(
                res[ptr: ptr + TTS_INT_SIZE], "big", signed=False
            )
            ptr += 4
            connection_id = res[ptr: ptr + connection_id_len]
            ptr += connection_id_len
            result.connection_id = connection_id.decode("utf-8")
    payload_size = int.from_bytes(res[ptr: ptr + TTS_INT_SIZE], "big", signed=True)
    payload = res[ptr + TTS_INT_SIZE:]
    payload_msg = payload

    if message_compression == GZIP:
        payload_msg = gzip.decompress(payload_msg)
    if serialization_method == JSON:
        result.payload_msg = json.loads(payload_msg)
    elif serialization_method == NO_SERIALIZATION:
        result.audio_only = True
        result.audio = payload_msg
    result.payload_size = payload_size
    return result


async def tts(text: str, params: dict, speaker: str = TTS_DEFAULT_SPEAKER):
    tts_client = TTSClient(
        speaker=speaker,
    )
    try:
        await tts_client.start_connection(params)
        audio = await tts_client.tts(
            TextRequest(
                text=text,
                finished=True,
            )
        )
    except Exception as e:
        raise e

    await tts_client.close(code=1000, reason="Normal closure")

    return audio


def contain_event(flags):
    return flags == CONTAIN_EVENT


# Utility Functions
def contains_sequence(bits):
    return bits in (MsgTypeFlagBits.POSITIVE_SEQ, MsgTypeFlagBits.NEGATIVE_SEQ)


def contains_event(bits):
    return bits == MsgTypeFlagBits.WITH_EVENT


def _write_message(
        event,
        payload: str,
        connection_id: str = None,
        session_id: str = None,
):
    event_bytes = struct.pack(">I", event)
    frame = event_bytes
    if connection_id is not None:
        connection_id_len = struct.pack(">I", len(connection_id))
        frame += connection_id_len + connection_id.encode("utf-8")
    if session_id is not None:
        session_id_len = struct.pack(">I", len(session_id))
        frame += session_id_len + session_id.encode("utf-8")
    payload_bytes = payload.encode("utf-8")
    payload_len_bytes = struct.pack(">I", len(payload_bytes))
    frame += payload_len_bytes + payload_bytes
    return frame


def new_message_from_byte(type_and_flag):
    # Mask out the last 4 bits
    bits = type_and_flag & ~0b00001111
    msg_type = MsgType.bits_to_type(bits)
    msg = Message(type_flag=type_and_flag)
    msg.msg_type = msg_type
    return msg

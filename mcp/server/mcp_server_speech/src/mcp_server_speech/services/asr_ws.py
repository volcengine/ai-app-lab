import asyncio
import gzip
import json
import logging
import time
import uuid
import wave
from collections.abc import Generator
from io import BytesIO
from pathlib import Path

import aiofiles
import websockets

logger = logging.getLogger(__name__)


def parse_headers(headers) -> dict:
    """Safely parse headers, handling cases with multiple values."""
    result = {}
    if not headers:
        return result

    for key in headers:
        try:
            # If multiple values exist for a header, use the first one
            values = headers.get_all(key)
            result[key] = values[0] if values else None
        except Exception:
            # If retrieval fails, skip this header
            continue
    return result


# Protocol version
PROTOCOL_VERSION = 0b0001
# Message types
FULL_CLIENT_REQUEST = (
    0b0001  # Full client request (includes audio metadata and parameters)
)
AUDIO_ONLY_REQUEST = 0b0010  # Client audio-only request
FULL_SERVER_RESPONSE = 0b1001  # Full server response (includes recognition results)
SERVER_ACK = 0b1011  # Server acknowledgment message
SERVER_ERROR_RESPONSE = 0b1111  # Server error response

# Message type specific flags
NO_SEQUENCE = 0b0000  # No sequence check
POS_SEQUENCE = 0b0001  # Positive sequence number (middle data frame)
NEG_WITH_SEQUENCE = 0b0011  # Negative sequence number (end data frame)

# Message serialization methods
NO_SERIALIZATION = 0b0000  # No serialization
JSON = 0b0001  # JSON serialization

# Message compression methods
GZIP = 0b0001  # Gzip compression


def generate_header(
    message_type=FULL_CLIENT_REQUEST,
    message_type_specific_flags=NO_SEQUENCE,
    serial_method=JSON,
    compression_type=GZIP,
    reserved_data=0x00,
):
    """Generate protocol header.

    Header structure (32 bits / 4 bytes):
    - protocol_version (4 bits): Protocol version
    - header_size (4 bits): Header size (in 4-byte units)
    - message_type (4 bits): Message type
    - message_type_specific_flags (4 bits): Message type specific flags
    - serialization_method (4 bits): Serialization method
    - message_compression (4 bits): Message compression method
    - reserved (8 bits): Reserved field
    """
    header = bytearray()
    header_size = 1  # Header size fixed at 1 unit (4 bytes)
    header.append((PROTOCOL_VERSION << 4) | header_size)
    header.append((message_type << 4) | message_type_specific_flags)
    header.append((serial_method << 4) | compression_type)
    header.append(reserved_data)
    return header


def generate_before_payload(sequence: int):
    """Generate sequence number section before payload (if needed)."""
    before_payload = bytearray()
    before_payload.extend(
        sequence.to_bytes(4, "big", signed=True)
    )  # sequence (4 bytes)
    return before_payload


def parse_response(res: bytes):
    """Parse server response message.

    Response structure:
    - header (size determined by header_size)
    - header_extensions (optional, size equals 8 * 4 * (header_size - 1))
    - payload (actual data)

    Returns:
        A dictionary containing the parsed results.
    """
    header_size = res[0] & 0x0F
    message_type = res[1] >> 4
    message_type_specific_flags = res[1] & 0x0F
    serialization_method = res[2] >> 4
    message_compression = res[2] & 0x0F
    payload = res[header_size * 4 :]  # Extract payload section
    result = {
        "is_last_package": False,  # Default to not being the last package
    }
    payload_msg = None
    payload_size = 0

    # Check if sequence number exists
    if message_type_specific_flags & 0x01:
        seq = int.from_bytes(payload[:4], "big", signed=True)
        result["payload_sequence"] = seq
        payload = payload[4:]  # Remove sequence number section

    # Check if this is the last package
    if message_type_specific_flags & 0x02:
        result["is_last_package"] = True

    # Parse payload based on message type
    if message_type == FULL_SERVER_RESPONSE:
        payload_size = int.from_bytes(payload[:4], "big", signed=True)
        payload_msg = payload[4:]
    elif message_type == SERVER_ACK:
        seq = int.from_bytes(payload[:4], "big", signed=True)
        result["seq"] = seq
        if len(payload) >= 8:  # ACK may contain additional information
            payload_size = int.from_bytes(payload[4:8], "big", signed=False)
            payload_msg = payload[8:]
    elif message_type == SERVER_ERROR_RESPONSE:
        code = int.from_bytes(payload[:4], "big", signed=False)
        result["code"] = code
        payload_size = int.from_bytes(payload[4:8], "big", signed=False)
        payload_msg = payload[8:]

    if payload_msg is None:  # If no payload message, return directly
        return result

    # Handle compression
    if message_compression == GZIP:
        payload_msg = gzip.decompress(payload_msg)

    # Handle serialization
    if serialization_method == JSON:
        payload_msg = json.loads(str(payload_msg, "utf-8"))
    elif (
        serialization_method != NO_SERIALIZATION
    ):  # Other non-text serialization, try to convert to string
        payload_msg = str(payload_msg, "utf-8")

    result["payload_msg"] = payload_msg
    result["payload_size"] = payload_size
    return result


def convert_audio_to_16k(input_path, output_path=None):
    """Convert audio file to 16000Hz MP3 format.

    Args:
        input_path: Input audio file path.
        output_path: Output audio file path. If None, generates a temp file in the same directory.

    Returns:
        Path of the converted audio file. Returns original path if conversion fails or dependencies are missing.
    """
    try:
        import tempfile

        from pydub import AudioSegment

        # If no output path specified, create temp file
        if output_path is None:
            temp_dir = str(Path(input_path).parent)
            # Use more explicit filename
            output_path = tempfile.mktemp(
                suffix="_16k.mp3", prefix=Path(input_path).stem + "_", dir=temp_dir
            )

        logger.info(f"Attempting to convert {input_path} to 16kHz MP3...")
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_frame_rate(16000)
        audio.export(output_path, format="mp3")
        logger.info(f"Successfully converted audio to 16000Hz: {output_path}")
        return output_path

    except ImportError:
        logger.warning(
            "Missing pydub dependency, cannot convert sample rate. Please run: pip install pydub"
        )
        return input_path
    except Exception as e:
        logger.error(f"Error converting audio sample rate ({input_path}): {e}")
        return input_path


def convert_audio_to_pcm(
    input_path, output_path=None, sample_rate=16000, channels=1, bits_per_sample=16
):
    """Convert audio file to PCM raw format.

    Args:
        input_path: Input audio file path.
        output_path: Output PCM file path. If None, generates a temp file in the same directory.
        sample_rate: Target sample rate (Hz).
        channels: Target number of channels.
        bits_per_sample: Target bits per sample.

    Returns:
        Path of the converted PCM file. Returns original path if conversion fails or dependencies are missing.
    """
    try:
        import tempfile

        from pydub import AudioSegment

        # If no output path specified, create temp file
        if output_path is None:
            temp_dir = str(Path(input_path).parent)
            # Use more explicit filename
            output_path = tempfile.mktemp(
                suffix=".pcm", prefix=Path(input_path).stem + "_", dir=temp_dir
            )

        logger.info(f"Attempting to convert {input_path} to PCM...")
        audio = AudioSegment.from_file(input_path)

        # Set parameters
        audio = audio.set_frame_rate(sample_rate)
        audio = audio.set_channels(channels)
        audio = audio.set_sample_width(
            bits_per_sample // 8
        )  # Convert bit depth to bytes

        # Export as raw PCM
        with Path(output_path).open("wb") as f:
            f.write(audio.raw_data)

        logger.info(f"Successfully converted audio to PCM format: {output_path}")
        logger.info(
            f"  Parameters: Sample Rate={sample_rate}Hz, Channels={channels}, Bit Depth={bits_per_sample}bit"
        )
        return output_path

    except ImportError:
        logger.warning(
            "Missing pydub dependency, cannot convert to PCM. Please run: pip install pydub"
        )
        return input_path
    except Exception as e:
        logger.error(f"Error converting audio to PCM ({input_path}): {e}")
        return input_path


def read_wav_info(data: bytes) -> tuple[int, int, int, int, bytes]:
    """Read audio information and data from WAV file byte stream.

    Args:
        data: WAV file byte content.

    Returns:
        A tuple containing: (channels, sample width (bytes), frame rate, frame count, audio data).
    """
    with BytesIO(data) as _f, wave.open(_f, "rb") as wave_fp:
        nchannels, sampwidth, framerate, nframes = wave_fp.getparams()[:4]
        wave_bytes = wave_fp.readframes(nframes)
    return nchannels, sampwidth, framerate, nframes, wave_bytes


class AsrWsClient:
    """Client for communicating with ASR service via WebSocket."""

    def __init__(self, audio_path: str, **kwargs):
        """Initialize ASR WebSocket client.

        Args:
            audio_path: Path to the audio file for recognition.
            **kwargs: Other configuration parameters, such as:
                seg_duration (int): Audio segment duration (ms), default 100.
                ws_url (str): WebSocket service address.
                uid (str): User ID.
                format (str): Audio format (e.g., "mp3", "wav", "pcm").
                rate (int): Sample rate (Hz).
                bits (int): Bit depth.
                channel (int): Number of channels.
                codec (str): Encoding format (e.g., "raw").
                streaming (bool): Enable simulated delay for streaming, default True.
                mp3_seg_size (int): MP3 format segment size (bytes), default 1000.
                api_resource_id (str): API resource ID.
                api_access_key (str): API access key.
                api_app_key (str): API application key.
        """
        self.audio_path = audio_path
        self.seg_duration = int(kwargs.get("seg_duration", 100))
        self.ws_url = kwargs.get(
            "ws_url", "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
        )
        self.uid = kwargs.get("uid", "test_user")
        self.format = kwargs.get("format", "mp3")
        self.rate = kwargs.get("rate", 16000)
        self.bits = kwargs.get("bits", 16)
        self.channel = kwargs.get("channel", 1)
        self.codec = kwargs.get("codec", "raw")
        self.streaming = kwargs.get("streaming", True)
        self.mp3_seg_size = kwargs.get("mp3_seg_size", 1000)
        # API authentication information
        self.api_resource_id = kwargs.get(
            "api_resource_id", "volc.bigasr.sauc.duration"
        )
        self.api_access_key = kwargs.get("api_access_key", "")
        self.api_app_key = kwargs.get("api_app_key", "")

    def construct_request(self, reqid: str) -> dict:
        """Build initial request parameter dictionary."""
        req = {
            "user": {
                "uid": self.uid,
            },
            "audio": {
                "format": self.format,
                "sample_rate": self.rate,
                "bits": self.bits,
                "channel": self.channel,
                "codec": self.codec,
            },
            "request": {
                "model_name": "bigmodel",
                "enable_punc": True,
            },
        }
        return req

    @staticmethod
    def slice_data(
        data: bytes, chunk_size: int
    ) -> Generator[tuple[bytes, bool], None, None]:
        """Slice byte data into specified size chunks.

        Yields:
            A tuple (chunk, is_last), where chunk is the data block and is_last indicates if it's the final block.
        """
        data_len = len(data)
        offset = 0
        while offset + chunk_size < data_len:
            yield data[offset : offset + chunk_size], False
            offset += chunk_size
        else:
            yield data[offset:data_len], True

    async def segment_data_processor(self, wav_data: bytes, segment_size: int):
        """Process audio data segments and communicate with WebSocket server."""
        reqid = str(uuid.uuid4())
        seq = 1
        request_params = self.construct_request(reqid)

        # Prepare initial request (FULL_CLIENT_REQUEST)
        payload_bytes = str.encode(json.dumps(request_params))
        payload_bytes = gzip.compress(payload_bytes)
        full_client_request = bytearray(
            generate_header(message_type_specific_flags=POS_SEQUENCE)
        )
        full_client_request.extend(generate_before_payload(sequence=seq))
        full_client_request.extend((len(payload_bytes)).to_bytes(4, "big"))
        full_client_request.extend(payload_bytes)

        # Prepare WebSocket request headers
        header = {
            "X-Api-Resource-Id": self.api_resource_id,
            "X-Api-Access-Key": self.api_access_key,
            "X-Api-App-Key": self.api_app_key,
            "X-Api-Request-Id": reqid,
        }

        logger.info(f"[{reqid}] Starting WebSocket connection: {self.ws_url}")
        try:
            async with websockets.connect(
                self.ws_url,
                extra_headers=header,
                max_size=1000000000,
                open_timeout=30,  # Increase connection timeout
            ) as ws:
                logger.info(
                    f"[{reqid}] WebSocket connected successfully, sending initial request..."
                )
                await ws.send(full_client_request)
                res = await ws.recv()
                result = parse_response(res)
                logger.info(
                    f"[{reqid}] Received initial response parse result: {result}"
                )

                logger.info(f"[{reqid}] Starting to send audio data stream...")
                # Iterate through audio data chunks
                for _, (chunk, last) in enumerate(
                    AsrWsClient.slice_data(wav_data, chunk_size=segment_size), 1
                ):
                    seq += 1
                    current_seq = seq if not last else -seq
                    start_time = time.time()

                    payload_bytes = gzip.compress(chunk)

                    flags = NEG_WITH_SEQUENCE if last else POS_SEQUENCE
                    audio_only_request = bytearray(
                        generate_header(
                            message_type=AUDIO_ONLY_REQUEST,
                            message_type_specific_flags=flags,
                        )
                    )
                    audio_only_request.extend(
                        generate_before_payload(sequence=current_seq)
                    )
                    audio_only_request.extend((len(payload_bytes)).to_bytes(4, "big"))
                    audio_only_request.extend(payload_bytes)

                    await ws.send(audio_only_request)

                    res = await ws.recv()
                    result = parse_response(res)
                    logger.info(f"[{reqid}] Seq {current_seq} response: {result}")

                    if self.streaming:
                        elapsed_time = time.time() - start_time
                        sleep_time = max(0, (self.seg_duration / 1000.0 - elapsed_time))
                        if sleep_time > 0:
                            await asyncio.sleep(sleep_time)

                logger.info(f"[{reqid}] All audio data sent successfully.")
                # Theoretically, the last recv should contain the final recognition result or confirmation
                # result variable contains the last received parsed response
                return result  # Return the last received result
        except websockets.exceptions.ConnectionClosedError as e:
            logger.warning(
                f"[{reqid}] WebSocket connection closed: Code={e.code}, Reason='{e.reason}'"
            )
            return {"error": "ConnectionClosed", "code": e.code, "reason": e.reason}
        except websockets.exceptions.WebSocketException as e:
            logger.error(f"[{reqid}] WebSocket connection failed: {e}")
            error_details = {"error": "WebSocketException", "message": str(e)}
            if hasattr(e, "status_code"):
                error_details["status_code"] = e.status_code
            if hasattr(e, "headers"):
                error_details["headers"] = dict(e.headers)
            return error_details
        except Exception as e:
            logger.error(
                f"[{reqid}] Unexpected error during processing: {e}", exc_info=True
            )
            return {"error": "UnexpectedError", "message": str(e)}

    async def execute(self) -> dict:
        """Execute ASR task: Read audio file and invoke segment processor."""
        logger.info(f"Start processing audio file: {self.audio_path}")
        original_path = self.audio_path
        audio_path = original_path
        temp_file_to_clean = None

        try:
            # Check file format and perform necessary conversions
            if not Path(original_path).exists():
                raise FileNotFoundError(f"Audio file not found: {original_path}")

            # Step 1: Ensure audio sample rate is 16kHz
            temp_16k_path = None
            if self.format.lower() == "mp3":
                logger.info(f"Converting MP3 file to 16kHz: {original_path}")
                temp_16k_path = convert_audio_to_16k(original_path)
                if temp_16k_path == original_path:
                    raise ValueError("Failed to convert MP3 file to 16kHz")
                logger.info(f"MP3 file converted to 16kHz: {temp_16k_path}")
            else:
                temp_16k_path = original_path

            # Step 2: Convert all audio to PCM format
            logger.info(f"Converting audio to PCM format: {temp_16k_path}")
            converted_path = convert_audio_to_pcm(
                temp_16k_path,
                sample_rate=16000,  # Force 16kHz sample rate
                channels=self.channel,
                bits_per_sample=self.bits,
            )
            if converted_path == temp_16k_path:
                if temp_16k_path and temp_16k_path != original_path:
                    # Clean up 16kHz temp file
                    try:
                        Path(temp_16k_path).unlink()
                    except OSError as e:
                        logger.warning(
                            f"Failed to clean up temp file: {temp_16k_path}, Error: {e}"
                        )
                raise ValueError("Failed to convert audio to PCM format")

            # Clean up 16kHz temp file if it exists and is not the original file
            if temp_16k_path and temp_16k_path != original_path:
                try:
                    Path(temp_16k_path).unlink()
                    logger.info(f"Cleaned up intermediate temp file: {temp_16k_path}")
                except OSError as e:
                    logger.warning(
                        f"Failed to clean up temp file: {temp_16k_path}, Error: {e}"
                    )

            audio_path = converted_path
            temp_file_to_clean = converted_path
            self.rate = 16000  # Update sample rate parameter
            self.format = "pcm"  # Update format to pcm
            logger.info(f"Audio converted to 16kHz PCM format: {audio_path}")

            # Read converted audio data
            try:
                async with aiofiles.open(audio_path, mode="rb") as _f:
                    audio_data = await _f.read()
                logger.info(
                    f"Successfully read audio file {audio_path}, size: {len(audio_data)} bytes"
                )

                if len(audio_data) == 0:
                    raise ValueError("Audio file is empty")
            except Exception as e:
                raise OSError(f"Failed to read audio file: {e}") from e

            segment_size = 0
            if self.format == "mp3":
                segment_size = self.mp3_seg_size
                logger.info(f"Using MP3 segment size: {segment_size} bytes")
            elif self.format == "wav":
                try:
                    nchannels, sampwidth, framerate, _, _ = read_wav_info(audio_data)
                    if (
                        framerate != self.rate
                        or nchannels != self.channel
                        or sampwidth * 8 != self.bits
                    ):
                        logger.warning(
                            f"WAV file parameters ({framerate}Hz, {nchannels}ch, {sampwidth * 8}bit) "
                            f"don't match configuration ({self.rate}Hz, {self.channel}ch, {self.bits}bit). "
                            "Results may be inaccurate."
                        )
                    size_per_sec = nchannels * sampwidth * framerate
                    segment_size = int(size_per_sec * self.seg_duration / 1000)
                    logger.info(
                        f"Calculated WAV segment size: {segment_size} bytes (based on {self.seg_duration}ms)"
                    )
                except Exception as e:
                    logger.error(f"Failed to read WAV file info: {e}")
                    raise ValueError("Unable to read WAV file information") from e
            elif self.format == "pcm":
                bytes_per_sample = self.bits // 8
                segment_size = int(
                    self.rate
                    * bytes_per_sample
                    * self.channel
                    * self.seg_duration
                    / 1000
                )
                logger.info(
                    f"Calculated PCM segment size: {segment_size} bytes (based on {self.seg_duration}ms)"
                )
            else:
                logger.error(f"Unsupported audio format: {self.format}")
                raise ValueError(f"Unsupported audio format: {self.format}")

            if segment_size <= 0:
                logger.error(
                    "Invalid calculated segment size, please check parameters."
                )
                raise ValueError("Invalid calculated segment size")

            result = await self.segment_data_processor(audio_data, segment_size)

            # Clean up temporary files after processing
            if temp_file_to_clean and Path(temp_file_to_clean).exists():
                try:
                    Path(temp_file_to_clean).unlink()
                    logger.info(f"Cleaned up temp file: {temp_file_to_clean}")
                except OSError as e:
                    logger.warning(
                        f"Failed to clean up temp file: {temp_file_to_clean}, Error: {e}"
                    )

            return result

        except FileNotFoundError:
            logger.error(f"Audio file not found: {self.audio_path}")
            return {"error": "FileNotFound", "path": self.audio_path}
        except Exception as e:
            logger.error(f"Error executing ASR task: {e}", exc_info=True)
            # Clean up temporary files even when error occurs
            if temp_file_to_clean and Path(temp_file_to_clean).exists():
                try:
                    Path(temp_file_to_clean).unlink()
                    logger.info(f"Cleaning up temp file: {temp_file_to_clean}")
                except OSError as ex:
                    logger.warning(
                        f"Failed to clean up temp file: {temp_file_to_clean}, Error: {ex}"
                    )
            return {"error": "ExecutionError", "message": str(e)}

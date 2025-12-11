import asyncio
import json
import logging
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

import requests

from mcp_server_speech.config import VOLC_APPID, VOLC_TOKEN
from mcp_server_speech.models import AsrInputArgs, AsrOutputResult, AudioSourceType
from mcp_server_speech.services.asr_ws import AsrWsClient

logger = logging.getLogger(__name__)


class AsrProcessor(ABC):
    """ASR Processor Abstract Base Class"""

    @abstractmethod
    async def process(self, source: str, options: dict | None = None) -> dict:
        """Process audio and return recognition results"""
        pass


class UrlAsrProcessor(AsrProcessor):
    """URL Audio Processor - Using REST API"""

    async def process(self, source: str, options: dict | None = None) -> dict:
        task_id = str(uuid.uuid4())
        submit_result = await self._submit_task(source, task_id)

        if not submit_result.get("success"):
            return {"error": submit_result.get("error", "Task submission failed")}

        x_tt_logid = submit_result.get("x_tt_logid", "")
        return await self._poll_result(task_id, x_tt_logid)

    async def _submit_task(self, url: str, task_id: str) -> dict:
        submit_url = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
        headers = {
            "X-Api-App-Key": VOLC_APPID,
            "X-Api-Access-Key": VOLC_TOKEN,
            "X-Api-Resource-Id": "volc.bigasr.auc",
            "X-Api-Request-Id": task_id,
            "X-Api-Sequence": "-1",
        }

        request = {
            "user": {"uid": "fake_uid"},
            "audio": {
                "url": url,
                "format": "mp3",
            },
            "request": {
                "model_name": "bigmodel",
            },
        }

        try:
            response = requests.post(
                submit_url, data=json.dumps(request), headers=headers
            )
            if (
                "X-Api-Status-Code" in response.headers
                and response.headers["X-Api-Status-Code"] == "20000000"
            ):
                return {
                    "success": True,
                    "x_tt_logid": response.headers.get("X-Tt-Logid", ""),
                }
            else:
                return {
                    "success": False,
                    "error": f"Task submission failed: {response.content}",
                }
        except Exception as e:
            return {"success": False, "error": f"Task submission exception: {str(e)}"}

    async def _poll_result(self, task_id: str, x_tt_logid: str) -> dict:
        query_url = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"
        headers = {
            "X-Api-App-Key": VOLC_APPID,
            "X-Api-Access-Key": VOLC_TOKEN,
            "X-Api-Resource-Id": "volc.bigasr.auc",
            "X-Api-Request-Id": task_id,
            "X-Tt-Logid": x_tt_logid,
        }

        max_retries = 100
        retry_count = 0

        while retry_count < max_retries:
            try:
                response = requests.post(query_url, json.dumps({}), headers=headers)
                code = response.headers.get("X-Api-Status-Code", "")

                if code == "20000000":  # Task completed
                    return {
                        "success": True,
                        "text": response.json()["result"]["text"],
                    }
                elif code not in ["20000001", "20000002"]:  # Task failed
                    return {
                        "success": False,
                        "error": f"Task query failed: {response.content}",
                    }

                await asyncio.sleep(1)
                retry_count += 1

            except Exception as e:
                return {"success": False, "error": f"Task query exception: {str(e)}"}

        return {"success": False, "error": "Task timeout"}


class FileAsrProcessor(AsrProcessor):
    """Local File Processor - Using WebSocket"""

    async def process(self, source: str, options: dict | None = None) -> dict:
        try:
            client = AsrWsClient(
                audio_path=source,
                api_app_key=VOLC_APPID,
                api_access_key=VOLC_TOKEN,
                **options or {},
            )
            result = await client.execute()

            if "error" in result:
                return {"success": False, "error": result["error"]}

            return {
                "success": True,
                "text": result["payload_msg"]["result"]["text"]
                if "payload_msg" in result
                else result,
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Local file processing failed: {str(e)}",
            }


class AsrService:
    """Unified ASR Service"""

    def __init__(self):
        self._processors = {
            AudioSourceType.URL: UrlAsrProcessor(),
            AudioSourceType.FILE: FileAsrProcessor(),
        }

    def detect_source_type(self, source: str) -> AudioSourceType:
        """Detect audio source type"""
        if source.startswith(("http://", "https://")):
            return AudioSourceType.URL
        elif Path(source).exists():
            return AudioSourceType.FILE
        else:
            raise ValueError(f"Invalid audio source: {source}")

    async def recognize(self, asr_args: AsrInputArgs) -> AsrOutputResult:
        """
        Unified speech recognition entry point

        Args:
            asr_args (AsrInputArgs): ASR input arguments

        Returns:
            AsrOutputResult: Recognition result
        """
        # source_type = self.detect_source_type(source)  # Detect source type
        processor = self._processors[asr_args.source_type]
        result = await processor.process(asr_args.source, asr_args.options)
        if result.get("success") is False:
            raise ValueError(f"Recognition failed: {result.get('error')}")

        return AsrOutputResult(
            text=result.get("text"),
        )


async def test_asr():
    """Test ASR service"""
    service = AsrService()

    # Test URL recognition
    url_result = await service.recognize(
        asr_args=AsrInputArgs(
            source="https://example.com/test.mp3",
            source_type=AudioSourceType.URL,
        )
    )
    logger.info(f"URL recognition result: {url_result}")

    # Test local file recognition
    # file_result = await service.recognize(
    #     asr_args=AsrInputArgs(
    #         source="/home/xxx/test.mp3",
    #         source_type=AudioSourceType.FILE,
    #         options={"format": "mp3", "rate": 16000, "channel": 1, "bits": 16},
    #     )
    # )
    # logger.info(f"Local file recognition result: {file_result}")


if __name__ == "__main__":
    asyncio.run(test_asr())

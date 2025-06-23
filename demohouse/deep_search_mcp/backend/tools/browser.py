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
import json
import re
import traceback
import aiohttp

from config.config import BROWSER_USE_ENDPOINT, SESSION_SAVE_PATH, RETRY_SLEEP_SECS, RESUME_SLEEP_SECS, RETRY_TIMES, \
    BROWSER_USE_AUTH_KEY
from models.events import BrowserUseToolCompletedEvent


async def browser_debug_stream(task_id, pod_name):
    browser_use_client = BrowserUseClient(task_id=task_id, pod_name=pod_name)
    queue = asyncio.Queue()

    async def produce_astream():
        try:
            async for event in browser_use_client.astream():
                await queue.put(event)
        finally:
            await queue.put(None)  # 表示astream结束

    async def produce_url():
        try:
            url_event = await browser_use_client.get_url()
            await queue.put(url_event)
        finally:
            await queue.put(None)  # 表示get_url结束

    astream_task = asyncio.create_task(produce_astream())
    url_task = asyncio.create_task(produce_url())

    finished = 0
    while finished < 2:
        item = await queue.get()
        if item is None:
            finished += 1
        else:
            yield item

    await asyncio.gather(astream_task, url_task)


class BrowserUseClient:
    def __init__(self, task_id, pod_name):
        self.task_id = task_id
        self.pod_name = pod_name
        self.endpoint = re.sub(r'^https?://', '', BROWSER_USE_ENDPOINT)
        self.stream_url = f"https://{self.endpoint}/tasks/{task_id}/stream"
        self.version_url = f"https://{self.endpoint}/tasks/{task_id}/devtools/json/version"
        self.resume_url = f"https://{self.endpoint}/tasks/{task_id}/resume"
        self.headers = {
            "X-Faas-Event-Type": "http",
            "Content-Type": "application/json",
            "x-faas-instance-name": pod_name,
            "Authorization": f"Bearer {BROWSER_USE_AUTH_KEY}" if BROWSER_USE_AUTH_KEY else "",
        }
        print(self.headers)

    async def astream(self):
        print("astream...")
        retries = 10
        for _ in range(retries):
            try:
                timeout = aiohttp.ClientTimeout(
                    total=None,
                    sock_connect=10,
                    sock_read=900
                )
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(self.stream_url, headers=self.headers) as response:
                        print("response", response)
                        if response.status != 200:
                            continue

                        async for line in response.content:
                            line = line.decode().strip()
                            print(line)
                            if line.startswith("data: "):
                                result = json.loads(line.removeprefix("data: "))
                                task_id = result.get("task_id", "")
                                result_data = json.loads(result.get("data", "").removeprefix("data: "))
                                status = result_data.get("status")
                                metadata = result_data.get("metadata", {})
                                action = metadata.get("data", {}).get("message", "")

                                yield BrowserUseToolCompletedEvent(
                                    status=status,
                                    task_id=task_id,
                                    metadata=result_data.get("metadata", {}),
                                )
                                if "'pause': {'reason'" in action:
                                    # post resume_url after 30s
                                    asyncio.create_task(self.resume_task())

                                if status == "completed":
                                    with open(f"{SESSION_SAVE_PATH}/{task_id}.txt", mode="w") as result_file:
                                        result_file.write(line)

                                    print("astream end...")
                                    return
            except Exception as e:
                traceback.print_exc()
                print(e)
                yield BrowserUseToolCompletedEvent(
                    success=False,
                    status="steam_failed",
                    task_id=task_id,
                )
            await asyncio.sleep(2)

    async def get_url(self):
        retries = 5
        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(self.version_url, headers=self.headers) as response:
                        if response.status == 200:
                            response_json = await response.json()
                            print(response_json)
                            websocket_url = response_json.get("webSocketDebuggerUrl")
                            if websocket_url:
                                websocket_url = websocket_url.replace("None", f"{self.endpoint}/tasks/{self.task_id}")
                                websocket_url = websocket_url.replace("ws://", "wss://")
                                websocket_url += f"?faasInstanceName={self.pod_name}"

                                print("websocket_url", websocket_url)
                                return BrowserUseToolCompletedEvent(
                                    status="url_fetched",
                                    task_id=self.task_id,
                                    url=websocket_url,
                                )
            except Exception as e:
                print(f"Attempt {attempt + 1} failed: {e}")

            await asyncio.sleep(2)

        return BrowserUseToolCompletedEvent(
            success=False,
            status="get_url_failed",
            task_id=self.task_id,
            url="",
        )

    async def resume_task(self):
        await asyncio.sleep(RESUME_SLEEP_SECS)
        print("start resume")
        retries = RETRY_TIMES
        for _ in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(self.resume_url, headers=self.headers) as resume_response:
                        if resume_response.status == 200:
                            print(f"resume {self.task_id} success")
                            return
                        else:
                            text = await resume_response.text()
                            print(f"resume {self.task_id} failed, failed text = {text}, resume_response = {resume_response}")
                            continue
            except Exception as e:
                print("resume failed", e)
            await asyncio.sleep(RETRY_SLEEP_SECS)

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
import http
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator
import aiohttp
import aiohttp
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from browser_use.llm import ChatOpenAI
from pydantic import BaseModel, SecretStr
from browser_use import Agent, BrowserProfile, BrowserSession

from browser import start_local_browser, start_remote_browser
from cdp import get_websocket_version, websocket_browser_endpoint, get_remote_websocket_version
from my_browser_use.agent.prompts import load_system_prompt, load_extend_prompt
from my_browser_use.controller.service import MyController
from my_browser_use.i18n import _, translate_planning_step_data
from task import TaskManager
from utils import ModelLoggingCallback, check_llm_config, enforce_log_format
from my_browser_use.agent.service import MyAgent as Agent
from my_browser_use.i18n import _, translate_planning_step_data, set_language

from browser_use.agent.views import (
	AgentOutput,
)

app = FastAPI()
load_dotenv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-faas-instance-name"],
)

llm_openai = "openai"
llm_deepseek = "deepseek"
llm_ark = "ark"
llm_name = llm_openai


# Global variable to track the port
CURRENT_CDP_PORT = 9222

# Global task queue and task storage
taskManager = TaskManager()

browser_session_endpoint = None
set_language(os.getenv("LANGUAGE", "en"))


def format_sse(data: dict) -> str:
    """Format data as SSE message"""
    message = f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    return message

async def gen_step_callback_result(model_output: AgentOutput, step_number: int):
    if model_output:
        conversation_update = {
            "step": step_number-1,  # need to minus 1 to refect actual step number
            "goal": model_output.current_state.next_goal if hasattr(model_output.current_state, "next_goal") else "",
            "memory": model_output.current_state.memory if hasattr(model_output.current_state, "memory") else "",
            "evaluation": model_output.current_state.evaluation_previous_goal if hasattr(model_output.current_state, "evaluation_previous_goal") else "",
            "task_status": "running",
            "actions": [],
        }
        if hasattr(model_output, "action"):
            actions = []
            for a in model_output.action:
                actions.append(a.model_dump(exclude_none=True))
            conversation_update['actions'] = actions

        return conversation_update

async def run_task(task: str, task_id: str) -> AsyncGenerator[str, None]:
    # Get task info to determine browser type and connection details
    task_info = taskManager.get_task_by_id(task_id)
    browser_wrapper = task_info['browser']

    cdp_url = None

    if browser_wrapper.remote_browser_id:
        # Remote browser - get the CDP URL from the remote browser API
        logging.info(f"[{task_id}] Starting task with remote browser: {browser_wrapper.remote_browser_id}")

        try:
            async with aiohttp.ClientSession() as session:
                get_url = f"{browser_wrapper.endpoint}/{browser_wrapper.remote_browser_id}"
                async with session.get(get_url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        browser_info = await response.json()
                        cdp_url = browser_info['cdp_url']
                        # Ensure CDP URL has proper trailing slash for Playwright
                        if not cdp_url.endswith('/'):
                            cdp_url = cdp_url + '/'
                        logging.info(f"[{task_id}] Retrieved remote CDP URL: {cdp_url}")
                    else:
                        error_text = await response.text()
                        raise Exception(f"Failed to get browser info. Status: {response.status}, Error: {error_text}")
        except Exception as e:
            logging.error(f"[{task_id}] Error getting remote browser websocket URL: {e}")
            raise
    else:
        # Local browser - use the port
        current_port = task_info['port']
        logging.info(f"[{task_id}] Starting task with local browser on port: {current_port}")
        cdp_url = f"http://127.0.0.1:{current_port}"

    browser_session = None
    agent = None
    agent_task = None

    # setup a message queue to pass intermediate result
    sse_queue = asyncio.Queue()

    async def send_sse_message(message):
        nonlocal sse_queue
        await sse_queue.put(message)

    # Send initial status and update task
    taskManager.update_task(task_id, {
        'status': 'starting',
        'started_at': datetime.now().isoformat()
    })
    await send_sse_message(format_sse({"task_id": task_id, "status": "started"}))

    base_dir = "videos"
    base_dir = os.path.join(base_dir, task_id)

    snapshot_dir = os.path.join(base_dir, "snapshots")
    Path(snapshot_dir).mkdir(parents=True, exist_ok=True)

    try:
        if browser_session_endpoint:
            headless = False
        else:
            headless = True

        browser_profile = BrowserProfile(
            headless=headless,
            disable_security=True,
            highlight_elements=True,
            wait_between_actions=1,
        )
        browser_session = BrowserSession(
            browser_profile=browser_profile,
            cdp_url=cdp_url,
        )

        await send_sse_message(format_sse({"task_id": task_id, "status": "browser_initialized"}))
        taskManager.update_task(task_id, {
            'status': 'browser_initialized',
            'last_update': datetime.now().isoformat()
        })
        logging.info(
            f"[{task_id}] Browser initialized with CDP URL: {cdp_url}")

        # set pause counter, to stop agent if it's still paused after 1 minute
        pause_counter = 0
        async def new_step_callback_wrapper(browser_state_summary, model_output, step_number):
            conversation_update = await gen_step_callback_result(model_output, step_number)
                
            # Update active_tasks with current step and goal
            taskManager.update_task(task_id, {
                'status': conversation_update["task_status"],
            })
            # Create and send conversation update without yielding
            translated_conversation_update = translate_planning_step_data(conversation_update)
            conv_message = format_sse(
                {
                    "task_id": task_id,
                    "status": "conversation_update",
                    "metadata": {
                        "type": "planning_step",
                        "data": translated_conversation_update
                    }
                }
            )
            await send_sse_message(conv_message)

            for i, action in enumerate(conversation_update['actions']):
                # Create and send conversation update without yielding
                action_message = format_sse(
                    {
                        "task_id": task_id,
                        "status": "conversation_update",
                        "metadata": {
                            "type": "message",
                            "data": {
                                "message": _("Taken action #{number}: {action}").format(number=i+1, action=action)
                            }
                        }
                    }
                )
                await send_sse_message(action_message)

        async def on_step_start(agent):
            taskManager.update_task(task_id, {
                'status': 'running',
            })
            # Create and send conversation update without yielding
            conv_message = format_sse(
                {
                    "task_id": task_id,
                    "status": "conversation_update",
                    "metadata": {
                        "type": "message",
                        "data": {
                            "message": _("Starting new step...")
                        }
                    }
                }
            )
            await send_sse_message(conv_message)

        # the real browser-use agent
        logging.info(
            f"Creating agent with task: {task}, llm: {llm_name}, task_id: {task_id}")
        try:
            if llm_name == llm_openai:
                logging.info(
                    f"[{task_id}] Creating OpenAI agent for task: {task}")
                agent = Agent(
                    task=task,
                    llm=ChatOpenAI(model="gpt-4o"),
                    use_vision=True,
                    browser_session=browser_session,
                    register_new_step_callback=new_step_callback_wrapper,
                )
            elif llm_name == llm_ark:
                logging.info(
                    f"[{task_id}] Creating Ark agent for task: {task}")
                # It's a workaround as ChatOpenAI will check the api key
                os.environ["OPENAI_API_KEY"] = "sk-dummy"

                base_url = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")

                llmOpenAI = ChatOpenAI(
                    base_url=base_url,
                    model=os.getenv("ARK_MODEL_ID"),
                    api_key=os.getenv("ARK_API_KEY"),
                    default_headers={
                        "X-Client-Request-Id": "vefaas-browser-use-20250403"},
                    # callbacks=[ModelLoggingCallback()],
                )
                extract_llm = ChatOpenAI(
                    base_url=base_url,
                    model=os.getenv("ARK_EXTRACT_MODEL_ID"),
                    api_key=os.getenv("ARK_API_KEY"),
                    default_headers={
                        "X-Client-Request-Id": "vefaas-browser-use-20250403"}
                )
                
                agent = Agent(
                    task=task,
                    llm=llmOpenAI,
                    tool_calling_method=os.getenv("ARK_FUNCTION_CALLING", "function_calling").lower(),
                    browser_session=browser_session,
                    register_new_step_callback=new_step_callback_wrapper,
                    # register_new_progress_callback=new_progress_callback,
                    use_vision=os.getenv(
                        "ARK_USE_VISION", "False").lower() == "true",
                    use_vision_for_planner=os.getenv(
                        "ARK_USE_VISION", "False").lower() == "true",
                    planner_llm=llmOpenAI,
                    planner_interval=int(os.getenv("ARK_PLANNER_INTERVAL", "1")),
                    page_extraction_llm=extract_llm,
                    controller=MyController(),
                    override_system_message=load_system_prompt(),
                    extend_planner_system_message=load_extend_prompt(),
                )
            else:
                raise ValueError(f"Unknown LLM type: {llm_name}")
            
            taskManager.update_task(task_id, {
                'agent': agent,
            })

        except Exception as e:
            logging.error(f"Failed to create agent: {str(e)}")
            yield format_sse({
                "task_id": task_id,
                "status": "error",
                "error": _("Agent creation failed: {error}").format(error=str(e))
            })
            taskManager.update_task(task_id, {
                'status': 'failed',
                'error': _("Agent creation failed: {error}").format(error=str(e)),
                'failed_at': datetime.now().isoformat()
            })

            logging.info('closing playwright driver and browser')
            browser_cdp = taskManager.get_task_by_id(task_id)['browser']
            if browser_cdp:
                await browser_cdp.stop()

            return

        await send_sse_message(format_sse({"task_id": task_id, "status": "agent_initialized"}))
        taskManager.update_task(task_id, {
            'status': 'agent_initialized',
            'last_update': datetime.now().isoformat()
        })
        logging.info(f"[{task_id}] Agent initialized and ready to run")

        # Start the agent in a separate async task
        agent_task = asyncio.create_task(agent.run(20, on_step_start=on_step_start))
        logging.info(f"[{task_id}] Agent started running")

        while not agent_task.done() or not sse_queue.empty():
            if not sse_queue.empty():
                yield await sse_queue.get()
            else:
                await asyncio.sleep(0.1)

        result = await agent_task

        final_result = None
        for history_item in reversed(result.history):
            for result_item in history_item.result:
                if hasattr(result_item, "is_done") and result_item.is_done == True:
                    final_result = result_item.extracted_content
                    break
            if final_result:
                break

        if not final_result:
            final_result = [
                [item.extracted_content for item in history_item.result if hasattr(
                    item, "extracted_content")]
                for history_item in result.history
            ]

        # task completed
        yield format_sse({
            "task_id": task_id,
            "status": "completed",
            "choices": [{
                "delta": {
                    "role": "assistant",  # 固定值 assistant
                    "content": final_result  # 不一定是完整的内容，只有 sse 请求执行完成后才会完成 内容输出
                },
            }],
            "result": final_result
        })
        taskManager.update_task(task_id, {
            'status': 'completed',
            'completed_at': datetime.now().isoformat(),
            'result': final_result
        })
        logging.info(f"[{task_id}] Task completed successfully")
    except Exception as e:
        logging.error(f"[{task_id}] Agent execution failed: {str(e)}")
        yield format_sse({
            "task_id": task_id,
            "status": "error",
            "error": _("Agent execution failed: {error}").format(error=str(e))
        })
        taskManager.update_task(task_id, {
            'status': 'failed',
            'error': _("Agent execution failed: {error}").format(error=str(e)),
            'failed_at': datetime.now().isoformat()
        })
    finally:
        # some cleanup work
        async def cleanup():
            if agent:
                agent.stop()
            if agent_task:
                await agent_task
            try:
                if browser_session:
                    await browser_session.close()
                browser_cdp = taskManager.get_task_by_id(task_id)['browser']
                if browser_cdp:
                    await browser_cdp.stop()
            except Exception as e:
                logging.error(f"Failed to close browser/context: {str(e)}")
        # put cleanup in a new task so it won't block the main loop
        asyncio.create_task(cleanup())

class Message(BaseModel):
    role: str
    content: str


class Messages(BaseModel):
    messages: list[Message]


class TaskRequest(BaseModel):
    task: str


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.post("/tasks")
async def run(request: Messages):
    task_id = str(uuid.uuid4())

    prompt = ""
    for message in request.messages:
        if message.role == "user":
            prompt = message.content
            logging.debug(f"Found user message: {prompt}")
            break

    logging.debug(f"Final prompt value: {prompt}")

    if browser_session_endpoint:
        browser = await start_remote_browser(browser_session_endpoint)
        current_port = None
    else:
        global CURRENT_CDP_PORT

        # TODO: kuoxin@ refine this logic
        # Increment the port for each task
        CURRENT_CDP_PORT += 1
        current_port = CURRENT_CDP_PORT

        browser = await start_local_browser(current_port)

    message_queue = asyncio.Queue()

    async def run_task_wrapper():
        task_info = taskManager.get_task_by_id(task_id)
        async for result in run_task(task_info['prompt'], task_id):
            await message_queue.put(format_sse({
                "task_id": task_id,
                "data": result
            }))
        # Using a None item indicate queue shutdown
        await message_queue.put(None)

    asyncio.create_task(run_task_wrapper())

    taskManager.add_task(task_id, {
        'prompt': prompt,
        'port': current_port,  # None for remote browsers, actual port for local
        'status': 'queued',
        'created_at': datetime.now().isoformat(),
        'browser': browser,
        'message_queue': message_queue,
        'agent': None,
    })

    # Return task ID immediately
    return {
        "task_id": task_id,
        "status": "queued"
    }


@app.get("/tasks/{task_id}/stream")
async def stream_task_results(task_id: str):
    """Stream results for a specific task"""
    message_queue: asyncio.Queue = taskManager.get_task_by_id(task_id)[
        'message_queue']

    async def running_task_generator():
        while True:
            try:
                message = await message_queue.get()
                # Using a None element indicating queue shutdown
                if message == None:
                    break
                yield message
            except asyncio.CancelledError:
                # request canceled from client side
                break

    return StreamingResponse(running_task_generator(), media_type="text/event-stream")

@app.get("/tasks/{task_id}/devtools/json/version")
async def json_version(task_id: str):
    logging.info(
        f"Received request for /devtools/json/version with task_id: {task_id}")
    logging.info(f"active_tasks: {taskManager.get_active_tasks}")

    if browser_session_endpoint:
        task = taskManager.get_task_by_id(task_id)
        browser_id = task['browser'].remote_browser_id

        return await get_remote_websocket_version(browser_session_endpoint, browser_id)
    else:
        port = await taskManager.get_task_port(task_id)
        return await get_websocket_version(str(port))


@app.websocket("/tasks/{task_id}/devtools/browser/{browser_id}")
async def cdp_websocket_browser(websocket: WebSocket, task_id: str, browser_id: str):
    logging.info(
        f"Received request for /devtools/browser/{browser_id}?task_id={task_id}")

    port = await taskManager.get_task_port(task_id, websocket)
    if port is None:
        return

    await websocket_browser_endpoint(websocket, browser_id, str(port))


async def cleanup_stale_tasks():
    logging.info("Starting stale task cleanup service")

    while True:
        try:
            current_time = datetime.now()
            stale_tasks = []

            # Find all queued tasks that are older than 5 minutes
            for task_id, task_info in taskManager.get_active_tasks().items():
                if task_info.get('status') == 'queued':
                    created_at = datetime.fromisoformat(
                        task_info.get('created_at', ''))
                    time_diff = (current_time - created_at).total_seconds()

                    # If task has been queued for a hour
                    if time_diff > 3600:
                        stale_tasks.append(task_id)

            # Clean up each stale task
            for task_id in stale_tasks:
                logging.warning(f"Cleaning up stale queued task: {task_id}")
                task_info = taskManager.get_task_by_id(task_id)

                if task_info and 'browser' in task_info:
                    browser_instance = task_info['browser']
                    if browser_instance:
                        try:
                            logging.info(
                                f"Closing browser for stale task: {task_id}")
                            await browser_instance.stop()
                        except Exception as e:
                            logging.error(
                                f"Error closing browser for stale task {task_id}: {e}")

                taskManager.remove_task(task_id)

                logging.info(f"Stale task {task_id} cleaned up")

        except Exception as e:
            logging.error(f"Error in stale task cleanup: {e}")

        await asyncio.sleep(60)


if __name__ == "__main__":
    llm_name = check_llm_config()
    enforce_log_format()

    browser_session_endpoint = os.getenv("BROWSER_SESSION_ENDPOINT")

    # Ensure the endpoint starts with http/https and ends with 'v1/browsers'
    if browser_session_endpoint:
        logging.info(f"using browser session endpoint: {browser_session_endpoint}")
        if not browser_session_endpoint.startswith(('http://', 'https://')):
            browser_session_endpoint = 'https://' + browser_session_endpoint
        if not browser_session_endpoint.endswith('v1/browsers'):
            browser_session_endpoint = browser_session_endpoint.rstrip('/') + '/v1/browsers'

    else:
        logging.info("no browser session endpoint provided, using local browser")

    @asynccontextmanager
    async def lifespan(app):
        cleanup_task = asyncio.create_task(cleanup_stale_tasks())
        app.state.cleanup_task = cleanup_task
        logging.info("Stale task cleanup service started")
        yield
        if not cleanup_task.done():
            cleanup_task.cancel()

    app.router.lifespan_context = lifespan

    uvicorn.run(app, host="0.0.0.0", port=8000)

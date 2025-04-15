# -*- coding: utf-8 -*-
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

"""
Main application entry point for the Planner service.
This file contains the FastAPI application setup and routes.
"""

import json
import uuid

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from typing import AsyncGenerator
from mcp import ClientSession
from mcp.client.sse import sse_client

from common.config import get_settings, get_models
from common.constants import MODEL_SYSTEM_PROMPT_MAP
from common.logger import LoggerManager
from client.model_client import ChatModelClient
from client.sandbox_manager_client import ECSSandboxManager
from services.planner import Planner

LoggerManager.initialize()
logger = LoggerManager.get_logger()

ecs_manager = ECSSandboxManager()

app = FastAPI(
    title="Agent Planner",
    description="计算机操作自动化代理规划服务",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """
    API for service health check
    """
        
    return {"status": "ok", "service": "agent-planner"}


@app.get("/models")
async def api_model_list():
    """
    API for list available models
    """

    settings = get_models()
    models = [{"name": model_detail.name, "display_name": model_detail.display_name}
              for model_detail in settings.values()]
    return {"models": models}


@app.post("/run/task")
async def api_run_task(request: Request):
    """
    API for excuting task

    Args:
        request: HTTP request object

    Returns:
        StreamingResponse: SSE stream response
    """

    task_id = str(uuid.uuid4())
    logger.info("Received task execution request, headers=%s, task_id=%s", request.headers, task_id)
    try:
        req = await request.json()
        logger.debug("request body: %s", req)
        user_prompt, user_system_prompt = req.get("user_prompt"), req.get("system_prompt")
        model_name = req.get("model_name")
        sandbox_id = req.get("sandbox_id")

        if not user_prompt:
            result = json.dumps({"status": "error", "message": "Missing parameter user_prompt"})
            raise HTTPException(status_code=400, detail=result)

        logger.info("handle_task sandbox_id=%s, task_id=%s, system_prompt=%s, user_prompt=%s",
                    sandbox_id, task_id, user_system_prompt, user_prompt[:50])
        return StreamingResponse(content=handle_task(sandbox_id, task_id,
                                                     model_name, user_system_prompt, user_prompt),
                                 media_type="text/event-stream; charset=utf-8")

    except Exception as e:
        logger.exception("API request handling failed")
        result = json.dumps({"status": "error", "message": str(e)})
        raise HTTPException(status_code=500, detail=result)


async def handle_task(sandbox_id, task_id, model_name,
                      user_system_prompt, user_prompt) -> AsyncGenerator[str, None]:
    mcp_server_endpoint = get_settings().sandbox.mcp_server_endpoint
    sandbox_endpoint = ecs_manager.get_tool_server_endpoint(sandbox_id)
    async with sse_client(url=mcp_server_endpoint,headers={"Authorization": get_settings().planner.auth_api_key}) as streams:
        async with ClientSession(*streams) as mcp_session:
            await mcp_session.initialize()
            ai_client = OpenAI(api_key=get_models().get(model_name).api_key,
                               base_url=get_models().get(model_name).base_url)
            model_client = ChatModelClient(ai_client=ai_client, model_name=model_name)
            model_client.setup_prompt(MODEL_SYSTEM_PROMPT_MAP.get(model_name), user_system_prompt, user_prompt)
            planner = Planner(model_client, mcp_session, task_id, sandbox_endpoint)
            async for msg in planner.run_task():
                logger.debug("response: %s", msg)
                yield msg

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
Task Planning and Execution Service

This module defines the Planner class responsible for orchestrating the
automation task execution loop. It interacts with the AI model for action
planning, the MCP session for environment interaction (screenshots, tool calls),
and UI adapters for formatting output.
"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Tuple
from mcp import ClientSession

from client.model_client import ChatModelClient
from client.sandbox_use_mcp_adaptor import (McpToolCall, DoubaoUITarsToComputerUseMCPAdaptor,
                                            ComputerUseSandboxMCPToolCallAdaptor)
from common.config import get_settings, get_models
from common.ui_interface import ComputerUseUIInterface
from common.constants import COMPUTER_USE, MODEL_DOUBAO_UI_TARS

MODEL_TOOL_CALL_ADAPTER_MAP = {
    COMPUTER_USE: {
        MODEL_DOUBAO_UI_TARS: DoubaoUITarsToComputerUseMCPAdaptor
    }
}

USE_TYPE_UI_ADAPTER_MAP = {
    COMPUTER_USE: ComputerUseUIInterface,
}

USE_TYPE_TOOL_CALL_ADAPTER_MAP = {
    COMPUTER_USE: ComputerUseSandboxMCPToolCallAdaptor
}

class Planner(object):
    def __init__(self, model_client: ChatModelClient, mcp_session: ClientSession, task_id: str,
                 sandbox_endpoint:str, use_type: str = COMPUTER_USE):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.model_client = model_client
        self.mcp_session = mcp_session
        self.task_id = task_id
        self.max_actions = get_models().get(model_client.model_name).max_action
        self.step_interval = get_settings().planner.step_interval
        self.wait_interval = get_settings().planner.action_wait_interval

        self.model_action_adaptor = MODEL_TOOL_CALL_ADAPTER_MAP[use_type][model_client.model_name]()
        self.ui_adaptor = USE_TYPE_UI_ADAPTER_MAP[use_type]()
        self.sandbox_tool_call_adapter = USE_TYPE_TOOL_CALL_ADAPTER_MAP[use_type](self.mcp_session)
        self.tool_server_endpoint = sandbox_endpoint

    async def _take_screenshot(self) -> Tuple[int, int, str]:
        """
        Capture screen screenshot

        Returns:
            Tuple[int, int, str]: screen width, height and image base64 data
        """
        result = await self.sandbox_tool_call_adapter.call(
            McpToolCall(name="screenshot", arguments={}), self.tool_server_endpoint)
        self.logger.debug("screenshot result=%s", result)
        if (len(result.content) == 0 or result.content[0].type != "text" or
                result.content[0].text == "{}" or "Error" in result.content[0].text):
            raise ValueError("Screenshot Failed")
        size = json.loads(result.content[0].text.replace("'", '"'))
        image_base64 = result.content[1].data if len(result.content) > 1 else ""
        self.logger.info("Screenshot captured - size=%s", size)
        return size['width'], size['height'], image_base64

    def _format_sse(self, data: dict | None = None, **kwargs) -> str:
        """
        Format data to SSE compliant string

        Args:
            data: Initial data dictionary
            **kwargs: Additional fields to merge

        Returns:
            str: Formatted SSE string
        """
        if not data:
            data = {}
        data.update(kwargs)
        data['task_id'] = self.task_id
        return f"data: {json.dumps(data)}\n\n"

    async def run_task(self) -> AsyncGenerator[str, Any]:
        """
        Execute the task

        Yields:
            AsyncGenerator[str, Any]: SSE formatted async generator
        """
        self.logger.info("Starting task execution, task_id=%s", self.task_id)
        yield self._format_sse({"action": "开始", "task_id": self.task_id})
        try:
            for _ in range(self.max_actions):
                # capture screenshot
                screen_width, screen_height, screenshot_image = await self._take_screenshot()
                image_base64 = f"data:image/png;base64,{screenshot_image}"
                yield self._format_sse({"screenshot": image_base64, "task_id": self.task_id})

                # get next action
                response = self.model_client.process_screenshot_and_update_history_messages(image_base64)
                summary, action = self.model_action_adaptor.parse_summary_and_action_from_model_response(response)
                self.logger.info("model response, summary=%s, action=%s", summary, action)

                # execute action
                tool_call = self.model_action_adaptor.to_mcp_tool_call(action, screen_width, screen_height)
                tool_name, tool_kwargs = tool_call["name"], tool_call["arguments"]
                action_for_ui = self.ui_adaptor.mcp_tool_call_to_ui(tool_name, tool_kwargs)
                yield self._format_sse({"action": action_for_ui, "summary": summary, "task_id": self.task_id})

                if tool_name == "wait":
                    await asyncio.sleep(get_settings().planner.action_wait_interval)
                    continue
                if tool_name == "finished":
                    break
                if tool_name == "call_user":
                    break

                self.logger.info("calling mcp tool: %s, kwargs: %s", tool_name, tool_kwargs)
                await self.sandbox_tool_call_adapter.call(tool_call,self.tool_server_endpoint)

                # sleep several seconds
                await asyncio.sleep(self.step_interval)
        except Exception as e:
            self.logger.exception("Task execution failed, error=%s", e)
            yield self._format_sse({"summary": "任务执行遇到问题，请稍后重试", "task_id": self.task_id, "error": str(e)})
        finally:
            self.logger.info("Task completed, task_id=%s", self.task_id)

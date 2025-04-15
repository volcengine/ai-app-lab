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
Adapters for converting AI model actions to MCP tool calls for sandbox interaction.

This module provides classes to:
1. Parse action calls from specific AI model responses (e.g., Doubao UI Tars).
2. Convert these parsed actions into standardized MCP (Multi-Control Platform) tool calls.
3. Execute these MCP tool calls within a sandbox environment via an MCP session.
"""

import logging
import re
from abc import ABC, abstractmethod
from typing import Tuple, Optional, Dict, Any, TypedDict

from mcp import ClientSession


class McpToolCall(TypedDict):
    name: str
    arguments: Dict[str, Any] | None


class ModelActionCallToMCPToolCallAdaptor(ABC):
    """
    To convert the action call returned by the Chat model into an MCP tool call

    for example, transforming click(100, 200) into click_mouse(100, 200)
    """

    @abstractmethod
    def to_mcp_tool_call(
            self, action_call: str, screen_width: int, screen_height: int) -> McpToolCall:
        pass


class DoubaoUITarsToComputerUseMCPAdaptor(ModelActionCallToMCPToolCallAdaptor):
    def __init__(self, layout_pattern=None, action_pattern=None, args_patterns=None):
        self.logger = logging.getLogger(self.__class__.__name__)
        if layout_pattern is None:
            layout_pattern = r'Action_Summary[:：](?P<summary>[\s\S]*)\nAction:(?P<action>.*)'
        if action_pattern is None:
            action_pattern = r'(?P<action>\w+)\(\s*(?P<args>.*)\)'
        if args_patterns is None:
            args_patterns = r'''
            click: start_box=\s*\'<bbox>(?P<left>\d+)\s+(?P<top>\d+)\s+(?P<bottom>\d+)\s+(?P<right>\d+)</bbox>\'
            drag: start_box=\s*\'<bbox>(?P<start_left>\d+)\s+(?P<start_top>\d+)\s+(?P<start_bottom>\d+)\s+(?P<start_right>\d+)</bbox>\',\s+end_box=\s*\'<bbox>(?P<end_left>\d+)\s+(?P<end_top>\d+)\s+(?P<end_bottom>\d+)\s+(?P<end_right>\d+)</bbox>\'
            type: content=\'(?P<content>.*)\'
            hotkey: key=\'(?P<keys>.*)\'
            scroll: direction=\'(?P<direction>[^']*)\'(,\s+start_box=\'<bbox>(?P<left>\d+)\s+(?P<top>\d+)\s+(?P<bottom>\d+)\s+(?P<right>\d+)</bbox>\')?
            '''
        self.layout_pattern = re.compile(layout_pattern)
        self.action_pattern = re.compile(action_pattern)
        action_args_pattern = [line.split(":", 1) for line in args_patterns.strip().splitlines()]
        self.args_pattern_map = {action.strip(): re.compile(pattern.strip()) for (action, pattern) in
                                 action_args_pattern}

    def parse_summary_and_action_from_model_response(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        m = next(self.layout_pattern.finditer(text), None)
        if m is not None:
            summary, action = m.groupdict()["summary"], m.groupdict()["action"]
            return summary, action
        return None, None

    def _parse_action_call(self, text) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        action_match = self.action_pattern.match(text.strip())
        if action_match is None:
            self.logger.debug("text does not match action call, text=%s, pattern=%s",
                              text, self.action_pattern)
            return None, None
        action = action_match.group('action')
        args = action_match.group('args')
        self.logger.debug("action=%-17s, args=%s", action, args)
        kwargs = {}
        if action not in ('wait', 'finished', 'call_user'):
            key = 'click' if action in ('click', 'left_double_click', 'right_click') else action
            args_pattern = self.args_pattern_map[key]
            m = args_pattern.match(args)
            if m is None:
                self.logger.info("args does not match, args=%s, pattern=%s", args, args_pattern)
            else:
                kwargs = m.groupdict()
                self.logger.debug("kwargs=%s", kwargs)
        return action, kwargs

    def to_mcp_tool_call(self, action_call: str,
                         screen_width: int, screen_height: int) -> McpToolCall:
        fx, fy = lambda v: int(int(v) * screen_width / 1000), lambda v: int(int(v) * screen_height / 1000)
        action, args = self._parse_action_call(action_call)
        self.logger.info("Converting action: %s, kwargs: %s", action, args)
        if action in ("click", "left_double_click", "right_click"):
            x, y = fx(args['left']), fy(args['top'])
            button = "left" if action == "click" else "double_left" if action == "left_double_click" else "right"
            tool_name, tool_kwargs = "click_mouse", {"x": x, "y": y, "button": button}
            self.logger.debug("tool_name=%s, tool_kwargs=%s", tool_name, tool_kwargs)
        elif action == "drag":
            sx, sy, tx, ty = fx(args['start_left']), fy(args['start_top']), fx(args['end_left']), fy(args['end_top'])
            tool_name = "drag_mouse"
            tool_kwargs = {"source_x": sx, "source_y": sy, "target_x": tx, "target_y": ty}
        elif action == "type":
            content = args['content'].replace('\\n', '\n').replace('\\"', '"').replace("\\'", "'")
            tool_name, tool_kwargs = "type_text", {"text": content}
        elif action == "hotkey":
            tool_name, tool_kwargs = "press_key", {"key": args['keys']}
        elif action == "scroll":
            x, y = fx(args.get('left') or 500), fy(args.get('top') or 500)
            tool_name = "scroll"
            tool_kwargs = {"x": x, "y": y, "direction": args['direction'], "amount": 3}
        elif action == "wait":
            tool_name, tool_kwargs = "wait", {}
        elif action == "finished":
            tool_name, tool_kwargs = "finished", None
        elif action == "call_user":
            tool_name, tool_kwargs = "call_user", None
        else:
            raise ValueError(f"Unknown action type: {action}")
        return McpToolCall(name=tool_name, arguments=tool_kwargs)


class SandboxMCPToolCallAdaptor(ABC):
    """
    沙箱MCP工具调用适配器
    """

    @abstractmethod
    async def call(self, tool_call: McpToolCall, sandbox_tool_server_endpoint=None):
        pass


class ComputerUseSandboxMCPToolCallAdaptor(SandboxMCPToolCallAdaptor):

    def __init__(self, mcp_session: ClientSession):
        self.mcp_session = mcp_session

    async def call(self, tool_call: McpToolCall, sandbox_tool_server_endpoint=None):
        if sandbox_tool_server_endpoint:
            tool_call["arguments"]["endpoint"] = sandbox_tool_server_endpoint
        return await self.mcp_session.call_tool(**tool_call)

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
UI Interface Adapters

This module provides classes to convert internal representations (like MCP tool calls)
into human-readable strings suitable for display in a user interface.
"""

class ComputerUseUIInterface(object):
    @staticmethod
    def mcp_tool_call_to_ui(tool_name, tool_kwargs):
        if tool_name == "click_mouse":
            args = "x=%d, y=%d" % (tool_kwargs['x'], tool_kwargs['y'])
            name = {"left": "单击", "double_left": "双击", "right": "右键单击"}[tool_kwargs['button']]
        elif tool_name == "drag_mouse":
            name = "拖拽"
            sx, sy, tx, ty = tool_kwargs['source_x'], tool_kwargs['source_y'], tool_kwargs['target_x'], tool_kwargs['target_y']
            args = "SourceX=%d, SourceY=%d, TargetX=%d, TargetY=%d" % (sx, sy, tx, ty)
        elif tool_name == "type_text":
            name, args = "输入", "内容=%s" % tool_kwargs['text']
        elif tool_name == "press_key":
            name, args = "快捷键", "key=%s" % '+'.join(tool_kwargs['key'].split())
        elif tool_name == "scroll":
            name, args = "滚动", "方向=%s, x=%d, y=%d" % (tool_kwargs['direction'], tool_kwargs['x'], tool_kwargs['y'])
        elif tool_name == "wait":
            name, args = "等待", ""
        elif tool_name == "finished":
            name, args = "完成", ""
        elif tool_name == "call_user":
            name, args = "用户请接管", ""
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
        return f"{name}({args})"

# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Dict, List, Optional

from arkitect.core.component.tool.manifest import ToolManifest


def tool_key(action_name: str, tool_name: str) -> str:
    return action_name + "/" + tool_name


class ToolPool:
    _tools: Dict[str, ToolManifest] = {}

    @classmethod
    def register(cls, tm: ToolManifest) -> None:
        if not tm:
            return

        cls._tools[tool_key(tm.action_name, tm.tool_name)] = tm

    @classmethod
    def all(cls, tool_names: Optional[List[str]] = None) -> Dict[str, ToolManifest]:
        """ """
        if not tool_names:
            return cls._tools

        return {name: tm for name, tm in cls._tools.items() if name in tool_names}

    @classmethod
    def get(cls, action_name: str, tool_name: str) -> Optional[ToolManifest]:
        """ """
        return cls._tools.get(tool_key(action_name, tool_name))

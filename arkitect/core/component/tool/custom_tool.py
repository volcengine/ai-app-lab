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

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from pydantic import Field

from arkitect.core.component.llm.model import ChatCompletionTool, FunctionDefinition
from arkitect.core.component.tool.base_tool import BaseTool
from arkitect.telemetry.trace import task
from arkitect.utils.func_convert import schema_for_function

from .model import BaseToolResponse, CustomToolResponse


class CustomTool(BaseTool):
    """
    CustomTool represents a tool constructed from a python callable function

    Attributes:
        func: The python function
        param_description: A description of the parameters of the python function.
    """

    func: Callable

    param_description: Dict[str, str] = {}
    manifest_field: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        """
        Configuration class for the CustomTool model.
        """

        arbitrary_types_allowed = True

    def __init__(
        self,
        func: Callable,
        param_description: Optional[Dict[str, str]] = {},
        **kwargs: Any,
    ) -> None:
        super().__init__(
            func=func,
            param_description=param_description,
            **kwargs,
        )

    @task()
    async def execute(
        self, parameters: Dict[str, Any] = {}, **kwargs: Any
    ) -> BaseToolResponse:
        response = self.func(**parameters)
        return CustomToolResponse(data=response)

    @property
    def name(self) -> str:
        """
        Returns the full name of the tool.
        """
        if not self.manifest_field:
            self.manifest_field = schema_for_function(
                self.func,
                param_descriptions=self.param_description,
            )
        return self.manifest_field.get("name", "")

    def tool_schema(self) -> ChatCompletionTool:
        """
        Returns the schema of the tool.
        """
        if not self.manifest_field:
            self.manifest_field = schema_for_function(
                self.func,
                param_descriptions=self.param_description,
            )
        return ChatCompletionTool(
            type="function", function=FunctionDefinition(**self.manifest_field)
        )

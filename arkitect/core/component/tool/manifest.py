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

from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime.types.chat import ChatCompletionMessageParam

from arkitect.core.client import default_ark_client
from arkitect.core.component.llm.model import ChatCompletionTool, FunctionDefinition
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.trace import task

from .model import ArkToolRequest, ArkToolResponse


class ParameterTypeEnum(str, Enum):
    STRING = "string"
    INT = "integer"
    FLOAT = "float"
    BOOL = "boolean"
    ARRAY = "array"
    OBJECT = "object"


class ToolParameter(BaseModel):
    """
    Represents a parameter for a tool.

    Attributes:
        name : The name of the parameter.
        description : A description of the parameter.
        param_type : The type of the parameter.
        required : Whether the parameter is required. Defaults to False.
    """

    param_type: ParameterTypeEnum
    name: str = ""
    description: str = ""
    required: bool = False
    items: List[ToolParameter] = Field(default_factory=list)
    enum: Optional[List[Union[int, bool, str]]] = None

    def validator(self) -> None:
        """
        Validates the parameter.
        """
        pass

    def manifest(self) -> Dict[str, Any]:
        """
        Generates a manifest dictionary for the parameter.
        """
        pm: Dict[str, Any] = {
            "description": self.description,
            "type": self.param_type.value,
        }

        if self.enum:
            pm["enum"] = self.enum

        if len(self.items) > 0 and self.param_type == ParameterTypeEnum.ARRAY:
            pm["items"] = self.items[0].manifest()

        if len(self.items) > 0 and self.param_type == ParameterTypeEnum.OBJECT:
            pm["properties"] = {item.name: item.manifest() for item in self.items}

        return pm


class ToolManifest(BaseModel):
    """
    Represents a manifest for a tool.

    Attributes:
        action_name : The name of the action associated with the tool.
        tool_name : The name of the tool.
        description : A description of the tool. Defaults to None.
        parameters : A list of parameters for the tool.
        manifest_field : A dictionary representing the manifest field.
        client : An instance of the AsyncArk client. Defaults to the default Ark client.
    """

    action_name: str
    tool_name: str
    description: Optional[str] = None
    parameters: List[ToolParameter]

    manifest_field: Dict[str, Any] = Field(default_factory=dict)
    client: AsyncArk = Field(default_factory=default_ark_client)

    class Config:
        """
        Configuration class for the ToolManifest model.
        """

        arbitrary_types_allowed = True

    def __init__(
        self,
        action_name: str,
        tool_name: str,
        description: Optional[str],
        parameters: List[ToolParameter] = [],
        **kwargs: Any,
    ) -> None:
        super().__init__(
            action_name=action_name,
            tool_name=tool_name,
            description=description,
            parameters=parameters,
            **kwargs,
        )

    @classmethod
    def from_manifest(cls, manifest: Dict[str, Any]) -> "ToolManifest":
        """
        Creates a ToolManifest instance from a dictionary.
        This method parses the provided dictionary to create a ToolManifest instance.
        """
        # parse parameters from manifest
        if not manifest:
            raise InvalidParameter("Invalid manifest: empty")

        tm = ToolManifest(
            action_name="", tool_name="", description=manifest.get("description", "")
        )
        if manifest.get("name", "").find("/") > -1:
            parts = manifest.get("name", "").split("/")
            tm.action_name = parts[0]
            tm.tool_name = parts[1]

        else:
            raise InvalidParameter("Invalid manifest: invalid name")

        properties: Dict[str, Any] = manifest.get("parameters", {}).get(
            "properties", {}
        )
        required: List[str] = manifest.get("parameters", {}).get("required", [])
        for name, prop in properties.items():
            param = ToolParameter(**prop)
            param.required = name in required
            tm.parameters.append(param)

        return tm

    def manifest(self) -> Dict[str, Any]:
        """
        Generates a manifest dictionary for the tool.
        """
        if not self.manifest_field:
            self.manifest_field = {
                "name": self.action_name + "/" + self.tool_name,
                "description": self.description or "",
                "parameters": {
                    "properties": {
                        parameter.name: parameter.manifest()
                        for parameter in self.parameters
                    },
                    "required": [
                        parameter.name
                        for parameter in self.parameters
                        if parameter.required
                    ],
                    "type": "object",
                },
            }
        return self.manifest_field

    @task()
    async def executor(
        self, parameters: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Union[ArkToolResponse, ChatCompletionMessageParam]:
        parameter = ArkToolRequest(
            action_name=self.action_name,
            tool_name=self.tool_name,
            parameters=parameters or {},
        )
        response = await self.client.post(
            path="/tools/execute",
            body=parameter.model_dump(),
            cast_to=ArkToolResponse,
        )
        return ArkToolResponse(**response)

    @property
    def name(self) -> str:
        """
        Returns the full name of the tool.
        """
        return self.action_name + "/" + self.tool_name

    def tool_schema(self) -> ChatCompletionTool:
        """
        Returns the schema of the tool.
        """
        return ChatCompletionTool(
            type="function", function=FunctionDefinition(**self.manifest())
        )

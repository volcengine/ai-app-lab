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

from abc import abstractmethod
from typing import Any, Optional, TypeVar

from langchain_core.output_parsers import BaseOutputParser
from langchain_core.prompts import BasePromptTemplate
from pydantic.v1 import BaseModel, Field
from volcenginesdkarkruntime import AsyncArk

from arkitect.core.client import default_ark_client

T = TypeVar("T")


class BaseLanguageModel(BaseModel):
    model: str
    client: AsyncArk = Field(default_factory=default_ark_client)
    template: Optional[BasePromptTemplate] = None
    output_parser: Optional[BaseOutputParser] = None

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    @abstractmethod
    def _run(self, *args: Any, **kwargs: Any) -> Any:
        raise NotImplementedError

    @abstractmethod
    async def _arun(self, *args: Any, **kwargs: Any) -> Any:
        raise NotImplementedError

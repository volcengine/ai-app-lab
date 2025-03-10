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

import abc
from typing import Any, Callable, Iterable

from pydantic import BaseModel

from ...types.runtime.model import RequestType, Response, ResponseType


class SyncRunner(BaseModel):
    invoke: Callable[[RequestType], Iterable[ResponseType]]

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    def __init__(
        self,
        runnable_func: Callable[[RequestType], Iterable[ResponseType]],
        **kwargs: Any,
    ):
        super().__init__(invoke=runnable_func, **kwargs)

    @abc.abstractmethod
    def run(self, request: RequestType) -> Response:
        pass

    @abc.abstractmethod
    def generate(self, request: RequestType) -> Iterable[str]:
        pass

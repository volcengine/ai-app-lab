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

import importlib
from typing import AsyncIterable, Callable

from .model import RequestType, ResponseType


def load_function(
    module_name: str, func_name: str
) -> Callable[[RequestType], AsyncIterable[ResponseType]]:
    """
    Loads a function from a specified module.
    """
    package = importlib.import_module(module_name)
    module = getattr(package, func_name)
    return module
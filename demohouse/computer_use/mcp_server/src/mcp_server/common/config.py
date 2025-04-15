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

import os
from pathlib import Path

from dynaconf import Dynaconf


def find_project_root():

    current = Path(__file__).resolve()

    for parent in [current, *current.parents]:
        if (parent / "pyproject.toml").exists() or (parent / "setup.py").exists():
            return str(parent)

    return os.getcwd()


root_dir = find_project_root()

settings = Dynaconf(
    settings_files=[
        os.path.join(root_dir, "settings.toml"),
    ],
)

log_config = settings.get("logging", {})
tool_server_config = settings.get("tool_server", {})

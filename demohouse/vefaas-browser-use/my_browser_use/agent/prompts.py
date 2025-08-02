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

import importlib.resources

def load_system_prompt():
    """Load the prompt template from the markdown file."""
    try:
        # This works both in development and when installed as a package
        with importlib.resources.files('my_browser_use.agent').joinpath('system_prompt.md').open('r') as f:
            return f.read() + load_extend_prompt()
    except Exception as e:
        raise RuntimeError(f'Failed to load system prompt template: {e}')

def load_extend_prompt():
    """Load the prompt template from the markdown file."""
    try:
        # This works both in development and when installed as a package
        with importlib.resources.files('my_browser_use.agent').joinpath('extend_prompt.md').open('r') as f:
            return f.read()
    except Exception as e:
        raise RuntimeError(f'Failed to load planner prompt template: {e}')
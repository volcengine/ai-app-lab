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

MCP_CONFIG_FILE_PATH = os.environ.get('DEEP_RESEARCH_MCP_CONFIG_FILE_PATH') or './mcp_servers_config.json'

SESSION_SAVE_PATH = os.environ.get('SESSION_SAVE_PATH') or '/tmp/deep_research_session/'

WORKER_LLM_MODEL = os.environ.get('WORKER_LLM_MODEL') or 'deepseek-r1-250120'

SUPERVISOR_LLM_MODEL = os.environ.get('SUPERVISOR_LLM_MODEL') or 'deepseek-r1-250120'

SUMMARY_LLM_MODEL = os.environ.get('SUMMARY_LLM_MODEL') or 'deepseek-r1-250120'

COLLECTION_DESCRIPTION = os.environ.get('COLLECTION_DESCRIPTION') or '私域知识'

BROWSER_USE_ENDPOINT = os.environ.get('BROWSER_USE_ENDPOINT') or ''

RESUME_SLEEP_SECS = int(os.environ.get('RESUME_SLEEP_SECS') or '30')

RETRY_SLEEP_SECS = int(os.environ.get('RETRY_SLEEP_SECS') or '2')

RETRY_TIMES = int(os.environ.get('RETRY_TIMES') or '5')

BROWSER_USE_AUTH_KEY = os.environ.get('BROWSER_USE_AUTH_KEY') or ''

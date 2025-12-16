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

import httpx

from veadk.memory.short_term_memory import ShortTermMemory
from veadk.a2a.remote_ve_agent import RemoteVeAgent
from veadk import Agent
from veadk.config import getenv

from multimedia_agent.prompt import PROMPT_ROOT_AGENT

market_agent = RemoteVeAgent(
    name="market_agent",
    auth_method="querystring",
    httpx_client=httpx.AsyncClient(
        base_url=getenv("REMOTE_AGENT_MARKET_AGENT_URL"), timeout=6000
    ),
)
director_agent = RemoteVeAgent(
    name="director_agent",
    auth_method="querystring",
    httpx_client=httpx.AsyncClient(
        base_url=getenv("REMOTE_AGENT_DIRECTOR_AGENT_URL"), timeout=6000
    ),
)
evaluate_agent = RemoteVeAgent(
    name="evaluate_agent",
    auth_method="querystring",
    httpx_client=httpx.AsyncClient(
        base_url=getenv("REMOTE_AGENT_EVALUATE_AGENT_URL"), timeout=6000
    ),
)
release_agent = RemoteVeAgent(
    name="release_agent",
    auth_method="querystring",
    httpx_client=httpx.AsyncClient(
        base_url=getenv("REMOTE_AGENT_RELEASE_AGENT_URL"), timeout=6000
    ),
)

root_agent = Agent(
    name="root_agent",
    description="根据用户的需求，生成电商视频",
    instruction=PROMPT_ROOT_AGENT,
    sub_agents=[market_agent, director_agent, evaluate_agent, release_agent],
    short_term_memory=ShortTermMemory(backend="local"),
    model_extra_config={
        "extra_body": {"thinking": {"type": getenv("THINKING_ROOT_AGENT", "enabled")}}
    },
)

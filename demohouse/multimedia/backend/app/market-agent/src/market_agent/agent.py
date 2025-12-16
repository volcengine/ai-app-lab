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

from veadk import Agent
from veadk.agents.sequential_agent import SequentialAgent
from veadk.config import getenv
from veadk.tools.builtin_tools.web_search import web_search

from market_agent.prompt import PROMPT_MARKET_AGENT, PROMPT_FORMAT_AGENT
from .hook.format_hook import fix_output_format_with_filter
from .tools.link_reader import read_url_link
from .utils.types import VideoConfig, json_response_config

market_agent = Agent(
    name="market_agent",
    description="根据用户的需求，生成视频配置脚本",
    # instruction=getenv("PROMPT_MARKET_AGENT"),
    instruction=PROMPT_MARKET_AGENT,
    tools=[web_search, read_url_link],
    output_key="video_config",
    model_extra_config={
        "extra_body": {"thinking": {"type": getenv("THINKING_MARKET_AGENT", "enabled")}}
    },
)

format_agent = Agent(
    name="format_agent",
    description="将模型的输出格式化",
    # instruction=getenv("PROMPT_FORMAT_AGENT"),
    instruction=PROMPT_FORMAT_AGENT,
    generate_content_config=json_response_config,
    output_schema=VideoConfig,
    output_key="video_config",
    after_model_callback=[fix_output_format_with_filter],
    model_extra_config={
        "extra_body": {"thinking": {"type": getenv("THINKING_FORMAT_AGENT", "enabled")}}
    },
)

agent = SequentialAgent(
    name="root_agent",
    description="根据用户的需求，生成视频配置脚本",
    sub_agents=[market_agent, format_agent],
)

root_agent = agent

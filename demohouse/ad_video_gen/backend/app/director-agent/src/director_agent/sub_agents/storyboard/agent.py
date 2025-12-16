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
from director_agent.hook.format_hook import fix_output_format
from director_agent.utils.types import (
    ShotList,
    json_response_config,
    max_output_tokens_config,
)
from veadk.config import getenv
from director_agent.prompt import PROMPT_STORYBOARD_AGENT, PROMPT_STORY_FORMAT_AGENT

storyboard_agent = Agent(
    name="storyboard_agent",
    description="根据视频配置脚本，生成分镜脚本",
    instruction=PROMPT_STORYBOARD_AGENT,
    generate_content_config=max_output_tokens_config,
    model_extra_config={
        "extra_body": {
            "thinking": {"type": getenv("THINKING_STORYBOARD_AGENT", "enabled")}
        }
    },
)

story_format_agent = Agent(
    name="story_format_agent",
    model_name=getenv("MODEL_FORMAT_NAME"),
    description="根据分镜脚本，格式化分镜脚本",
    instruction=PROMPT_STORY_FORMAT_AGENT,
    generate_content_config=json_response_config,
    output_schema=ShotList,
    output_key="shot_list",
    after_model_callback=[fix_output_format],
    model_extra_config={
        "extra_body": {
            "thinking": {"type": getenv("THINKING_STORY_FORMAT_AGENT", "enabled")}
        }
    },
)

story_agent = SequentialAgent(
    name="story_sequential_agent",
    description="根据分镜脚本，为分镜生成图片",
    sub_agents=[storyboard_agent, story_format_agent],
)

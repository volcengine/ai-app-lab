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

from director_agent.hook.shorten_url import hook_shorten_url

# from veadk.tools.builtin_tools.video_generate import video_generate
# from director_agent.tools.video_generate_gather import video_generate
from director_agent.tools.video_generate_http import video_generate
from director_agent.hook.check_and_raise import raise_result_error
from director_agent.hook.format_hook import fix_output_format
from director_agent.utils.types import (
    json_response_config,
    VideoList,
    max_output_tokens_config,
)
from veadk.config import getenv
from director_agent.prompt import PROMPT_VIDEO_AGENT, PROMPT_VIDEO_FORMAT_AGENT

video_generate_agent = Agent(
    name="video_generate_agent",
    description="根据分镜脚本，生成分镜视频",
    instruction=PROMPT_VIDEO_AGENT,
    tools=[video_generate],
    after_tool_callback=[raise_result_error, hook_shorten_url],
    generate_content_config=max_output_tokens_config,
    model_extra_config={
        "extra_body": {"thinking": {"type": getenv("THINKING_VIDEO_AGENT", "enabled")}}
    },
)

video_format_agent = Agent(
    name="video_format_agent",
    model_name=getenv("MODEL_FORMAT_NAME"),
    description="将模型的输出格式化",
    instruction=PROMPT_VIDEO_FORMAT_AGENT,
    generate_content_config=json_response_config,
    output_schema=VideoList,
    output_key="video_list",
    after_model_callback=[fix_output_format],
    model_extra_config={
        "extra_body": {
            "thinking": {"type": getenv("THINKING_VIDEO_FORMAT_AGENT", "disabled")}
        }
    },
)

video_agent = SequentialAgent(
    name="video_agent",
    description="根据分镜脚本，生成分镜视频",
    sub_agents=[video_generate_agent, video_format_agent],
)

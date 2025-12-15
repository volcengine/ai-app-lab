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
from .sub_agents.image.agent import image_agent
from .sub_agents.storyboard.agent import story_agent
from .sub_agents.video.agent import video_agent
from veadk.config import getenv
from director_agent.prompt import PROMPT_ROOT_AGENT

agent = Agent(
    name="director_agent",
    description="根据视频配置脚本，生成分镜视频",
    # instruction=getenv("PROMPT_ROOT_AGENT"),
    instruction=PROMPT_ROOT_AGENT,
    sub_agents=[story_agent, image_agent, video_agent],
    model_extra_config={
        "extra_body": {
            "thinking": {"type": getenv("THINKING_DIRECTOR_AGENT", "enabled")}
        }
    },
)

root_agent = agent

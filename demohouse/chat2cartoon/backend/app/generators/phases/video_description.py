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

import time
from typing import AsyncIterable

from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from app.clients.llm import LLMClient
from app.constants import LLM_ENDPOINT_ID
from app.generators.base import Generator
from app.generators.phase import Phase
from app.mode import Mode
from app.output_parsers import OutputParser, parse_video_description
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
    ArkMessage,
)
from arkitect.core.errors import InvalidParameter
from arkitect.telemetry.logger import ERROR
from arkitect.utils.context import get_reqid, get_resource_id

VIDEO_DESCRIPTION_SYSTEM_PROMPT = ArkMessage(
    role="system",
    content="""# 角色
你是描述词生成器，你将根据对话记录中Phase为StoryBoard、FirstFrameImageDescription提供的故事、分镜信息和首帧信息里关于动作和状态改变的描述，按照要求生成对应的视频描述词，用于下一步生成视频。

# 相关限制
- 不能出现少儿不宜、擦边、违禁、色情的词汇。
- 不能回复与小朋友有接触的语句。
- 不能询问家庭住址等敏感信息。
- 不要回复台词。
- 不要描述静态的特征。

# 任务描述与要求
- 认真分析分镜信息及角色的描述和动作，以场景，角色，动作来组织语言，关注动态动作。例如：中景，角色1，动作1，动作2，角色2，动作2。
- 如背景有变化，描述中增加背景+运动。
- 按照规定格式生成简洁清晰的描述词。
- 视频序号和分镜序号必须一一对应且总数保持一致。
- [重要] 如果用户提示词内容没问题，在正常返回结果前加上"phase=VideoDescription"的前缀。

# 输出按照以下格式回答：
phase=VideoDescription
视频1：
角色：小熊
描述：近景，小熊，跑过来，挥挥手，天空中下起了毛毛细雨。
视频2：
角色：小猫
描述：远景，小猫，坐着沉思，然后站起来丢开手里的书本，转身去玩皮球。
视频3：
角色：兔子，老虎
描述：中景，兔子，先转圈，然后唱起歌，老虎，在一旁来回踱步。
视频4:
角色：水牛
描述：中景，水牛，用小手擦了擦眼睛，委屈地“呜呜”哭泣，接着，水牛在床上，抱着被子不断变换姿势，翻来覆去，显得十分痛苦和无助。
视频5:
角色：小兔子
描述：近景，小兔子，眼睛紧紧的盯着电视屏幕，电视机里播放着动画片。
视频6:
描述：近景，小狐狸，起身一边拿出电视遥控器关掉电视，一边走向床边。
""",
)


class VideoDescriptionGenerator(Generator):
    llm_client: LLMClient
    request: ArkChatRequest
    mode: Mode
    output_parser: OutputParser

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        super().__init__(request, mode)

        chat_endpoint_id = LLM_ENDPOINT_ID
        if request.metadata:
            chat_endpoint_id = request.metadata.get("chat_endpoint_id", LLM_ENDPOINT_ID)

        self.llm_client = LLMClient(chat_endpoint_id)
        self.output_parser = OutputParser(request)
        self.request = request
        self.mode = mode

    async def generate(self) -> AsyncIterable[ArkChatResponse]:
        # extract script, storyboards and role descriptions to use as context when generating video descriptions
        script = self.output_parser.get_script()
        storyboards, _ = self.output_parser.get_storyboards()
        role_descriptions = self.output_parser.get_role_descriptions()
        (
            first_frame_descriptions_text,
            first_frame_descriptions,
        ) = self.output_parser.get_first_frame_descriptions()

        if len(script) == 0:
            ERROR("script not found")
            raise InvalidParameter("script not found")

        if len(role_descriptions) == 0:
            ERROR("role descriptions not found")
            raise InvalidParameter("messages", "role descriptions not found")

        if len(storyboards) == 0:
            ERROR("storyboards not found")
            raise InvalidParameter("messages", "storyboards not found")

        if len(first_frame_descriptions) == 0:
            ERROR("first frame description not found")
            raise InvalidParameter("messages", "first frame description not found")

        messages = [
            VIDEO_DESCRIPTION_SYSTEM_PROMPT,
            ArkMessage(
                role="assistant", content=f"phase={Phase.SCRIPT.value}\n{script}"
            ),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(
                role="assistant",
                content=f"phase={Phase.STORY_BOARD.value}\n{storyboards}",
            ),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(
                role="assistant",
                content=f"phase={Phase.ROLE_DESCRIPTION.value}\n{role_descriptions}",
            ),
            ArkMessage(role="user", content="下一步"),
            ArkMessage(
                role="assistant",
                content=f"phase={Phase.FIRST_FRAME_DESCRIPTION.value}\n{first_frame_descriptions_text}",
            ),
            ArkMessage(
                role="user",
                content=f"生成分镜视频的内容描述。需要生成的视频描述数量是{len(first_frame_descriptions)}个",
            ),
        ]

        if self.mode == Mode.CONFIRMATION:
            async for resp in self.llm_client.chat_generation(messages):
                yield resp
        else:  # self.mode == Mode.REGENERATION:
            completion = ""
            async for chunk in self.llm_client.chat_generation(messages):
                if not chunk.choices:
                    continue
                completion += chunk.choices[0].delta.content
            new_video_descriptions = parse_video_description(completion)

            # user request can include video_descriptions field containing a list of descriptions they don't
            # want regenerated, handle case by only filling in empty descriptions with the newly generated first
            # frame descriptions
            previous_video_descriptions = self.output_parser.get_video_descriptions()
            new_content = ""
            for index, pvd in enumerate(previous_video_descriptions):
                if not pvd.description:
                    pvd.description = new_video_descriptions[index].description
                    pvd.characters = new_video_descriptions[index].characters
                new_content += f"{pvd.to_content(index + 1)}\n"

            yield ArkChatCompletionChunk(
                id=get_reqid(),
                choices=[
                    Choice(
                        index=0,
                        delta=ChoiceDelta(
                            content=f"phase={Phase.VIDEO_DESCRIPTION.value}\n\n{new_content}"
                        ),
                    ),
                ],
                created=int(time.time()),
                model=get_resource_id(),
                object="chat.completion.chunk",
            )

            yield ArkChatCompletionChunk(
                id=get_reqid(),
                choices=[
                    Choice(
                        index=1,
                        finish_reason="stop",
                        delta=ChoiceDelta(content=""),
                    )
                ],
                created=int(time.time()),
                model=get_resource_id(),
                object="chat.completion.chunk",
            )

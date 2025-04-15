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

"""
Client for interacting with the AI model service.
Handles communication with the model API and response processing.
"""

import logging
from typing import List

from openai import OpenAI
from openai.types.chat import ChatCompletionAssistantMessageParam as AssistantMessage
from openai.types.chat import ChatCompletionContentPartImageParam as ContentPartImage
from openai.types.chat import ChatCompletionMessageParam as Message
from openai.types.chat import ChatCompletionSystemMessageParam as SystemMessage
from openai.types.chat import ChatCompletionUserMessageParam as UserMessage
from openai.types.chat.chat_completion_content_part_image_param import ImageURL

from common.config import get_settings, get_models


class ChatModelClient(object):
    """
    Manage chat session with AI models which does not support Function Calls
    
    Handles message history, image content processing and API communication with large language models.
    """
    def __init__(self, ai_client: OpenAI, model_name: str):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.messages: List[Message] = []
        self.ai_client = ai_client
        self.model_name = model_name
        self.max_images = get_models().get(model_name).max_images

    def setup_prompt(self, system_prompt: str, user_system_prompt: str, user_prompt:str):
        self.messages.append(SystemMessage(role="system", content=system_prompt))
        self.messages.append(SystemMessage(role="system", content=user_system_prompt))
        self.messages.append(UserMessage(role="user", content=user_prompt))


    def process_screenshot_and_update_history_messages(self, screenshot_image_url: str) -> str:
        snap_content = ContentPartImage(type="image_url", image_url=ImageURL(url=screenshot_image_url))
        screenshot_message = UserMessage(role="user", content=[snap_content])
        self.messages.append(screenshot_message)
        self._remove_overflow_image_messages()
        completion = self.ai_client.chat.completions.create(messages=self.messages, model=self.model_name)
        self.logger.debug("completion=%s", completion)
        content = completion.choices[0].message.content
        self.messages.append(AssistantMessage(role="assistant", content=content))
        return content

    def _remove_overflow_image_messages(self):
        max_images = self.max_images
        messages = []
        preserved_messages = self.messages[:3]
        other_messages = self.messages[3:]


        for msg in reversed(other_messages):
            cs = msg.get("content")
            if isinstance(cs, list):
                cs = [c for c in cs if c.get("type") == "image_url"]
                max_images -= len(cs)
            if max_images > 0:
                messages.append(msg)
        self.messages = preserved_messages + list(reversed(messages))

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

from google.genai import types
from pydantic import BaseModel, Field
from typing import Optional

json_response_config = types.GenerateContentConfig(
    response_mime_type="application/json", max_output_tokens=18000
)

max_output_tokens_config = types.GenerateContentConfig(max_output_tokens=18000)


class VideoUrl(BaseModel):
    """A video url."""

    video_url: str = Field(description="The url of the video")


class Film(BaseModel):
    url: str


class Video(BaseModel):
    index: int
    video_gen_task_id: str
    video_url: str
    video_data: Optional[bytes] = None


class Tone(BaseModel):
    index: int
    words: str
    tone: str


class Audio(BaseModel):
    index: int
    audio_gen_task_id: str
    audio_url: str
    audio_data: Optional[bytes] = None

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

from typing import Optional

from google.genai import types
from pydantic import BaseModel, Field

json_response_config = types.GenerateContentConfig(
    response_mime_type="application/json", max_output_tokens=18000
)

max_output_tokens_config = types.GenerateContentConfig(max_output_tokens=18000)


class Status(BaseModel):
    """A status."""

    success: bool = Field(description="如果结果成功则为True，否则为False")
    message: str = Field(description="运行成功该字段为空，否则为错误信息")


class ImageItem(BaseModel):
    """An image."""

    id: int = Field(description="The shot id of the image")
    url: str = Field(description="The url of the image")


class Image(BaseModel):
    """Image list for a shot."""

    shot_id: str = Field(description="The shot id")
    prompt: str = Field(description="The description for generating image")
    action: str = Field(description="The description for generating videos")
    reference: str = Field(description="The reference url for the shot")
    words: str = Field(description="The words for the shot")
    images: list[ImageItem] = Field(description="The list of images")


class ImageList(BaseModel):
    """Image list."""

    image_list: Optional[list[Image]] = Field(
        description="The list of images, if success"
    )
    status: Optional[Status] = Field(description="The status of the result")


class VideoItem(BaseModel):
    """A video."""

    id: int = Field(description="The shot id of the video")
    url: str = Field(description="The url of the video")


class Video(BaseModel):
    """Video list for a shot."""

    shot_id: str = Field(description="The shot id")
    prompt: str = Field(description="The description for generating image")
    action: str = Field(description="The description for generating videos")
    reference: str = Field(description="The reference url for the shot")
    words: str = Field(description="The words for the shot")
    videos: list[VideoItem] = Field(description="The list of videos")


class VideoList(BaseModel):
    """Video list."""

    video_list: Optional[list[Video]] = Field(description="The list of videos")
    status: Optional[Status] = Field(description="The status of the result")


class Shot(BaseModel):
    """A shot."""

    id: str = Field(description="The shot id")
    image: str = Field(description="The description for generating image")
    action: str = Field(description="The description for generating videos")
    reference: str = Field(description="The reference url for the shot")
    words: str = Field(description="The words for the shot")


class ShotList(BaseModel):
    """Shot list."""

    shot_list: list[Shot] = Field(description="The list of shots")

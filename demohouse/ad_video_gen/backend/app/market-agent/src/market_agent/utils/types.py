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

json_response_config = types.GenerateContentConfig(
    response_mime_type="application/json", max_output_tokens=18000
)


class Status(BaseModel):
    """A status."""

    success: bool = Field(description="如果结果成功则为True，否则为False")
    message: str = Field(description="运行成功该字段为空，否则为错误信息")


# status的描述
"""
status字段：status字段包括两部分, 如果业务正常该部分为success: True, message: ''，否则为success: False, message: '错误信息'
注意：当遇到Agent执行异常，如缺少内容，运行出错，结果不完整，用户输入内容不足以完成任务时，请在status字段中反馈，而不是在业务字段中反馈描述，如有上述问题，业务字段可以为空。只反馈错误即可
"status": {
            "success": bool, 是否成功
            "message": str, 错误信息,成功时为空字符串
        }
"""


class ProductInfo(BaseModel):
    """A product information."""

    name: str = Field(description="A Product's Name")
    selling_point: str = Field(description="The Product's Selling Point")
    resources: list[str] = Field(description="verified URL to an image of the product")
    audience: str = Field(description="The Product's Audience")


class VideoConfig(BaseModel):
    """Video configuration."""

    video_type: str = Field(description="The type of video to be generated")
    product_info: ProductInfo = Field(description="The product information")
    video_advice: str = Field(description="The video advice")
    status: Status = Field(description="The status of the video configuration")

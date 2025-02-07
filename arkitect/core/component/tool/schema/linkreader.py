# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ..ark_tool import ArkTool, ParameterTypeEnum, ToolParameter


class LinkReader(ArkTool):
    def __init__(self) -> None:
        super().__init__(
            action_name="LinkReader",
            tool_name="LinkReader",
            description="当你需要获取网页、pdf、抖音视频内容时，使用此工具。"
            + "可以获取url链接下的标题和内容。\n\n"
            + 'examples: {"url_list":["abc.com", "xyz.com"]}',
            parameters=[
                ToolParameter(
                    name="url_list",
                    description="需要解析网页链接,最多3个,以列表返回",
                    param_type=ParameterTypeEnum.ARRAY,
                    items=[
                        ToolParameter(
                            param_type=ParameterTypeEnum.STRING,
                            required=True,
                        )
                    ],
                    required=True,
                )
            ],
        )

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

from typing import Any, Dict, List

from arkitect.core.component.llm.model import ChatCompletionTool


def compare_dict(dict1, dict2):
    assert len(dict1) == len(dict2)
    for key, val in dict1.items():
        assert key in dict2
        val2 = dict2[key]
        if isinstance(val, dict):
            assert compare_dict(val, val2)
        else:
            assert val == val2
    return True


def validate_function_conversion(
    tool: ChatCompletionTool,
    expected_name: str,
    expected_description: str,
    expected_params: Dict[str, Any],
):
    fc = tool.function
    assert fc.name == expected_name
    assert fc.description == expected_description
    compare_dict(expected_params, fc.parameters)
    return True


def test_cast_basic_function():
    def test_basic(
        a: int,
        b: Dict[str, Any],
        c: str = "hello",
        d: List[str] = ["a", "b"],
    ):
        """test_basic

        Args:
            a (int): number 1
            b (str, optional): string two. Defaults to "hello".

        Returns:
            str: combined string
        """
        c[0]
        return f"{a}, {b}"

    tool = ChatCompletionTool.from_function(test_basic)
    assert validate_function_conversion(
        tool,
        "test_basic",
        """test_basic

        Args:
            a (int): number 1
            b (str, optional): string two. Defaults to "hello".

        Returns:
            str: combined string
        """,
        {
            "properties": {
                "a": {"default": None, "type": "integer"},
                "b": {"default": None, "type": "object"},
                "c": {"default": "hello", "type": "string"},
                "d": {
                    "default": ["a", "b"],
                    "items": {"type": "string"},
                    "type": "array",
                },
            },
            "type": "object",
            "required": ["a", "b"],
        },
    )


if __name__ == "__main__":
    test_cast_basic_function()

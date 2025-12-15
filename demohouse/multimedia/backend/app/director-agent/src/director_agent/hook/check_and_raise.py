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

from typing import Any, Optional

from google.adk.tools import BaseTool, ToolContext

from veadk.utils.logger import get_logger

logger = get_logger(__name__)


def error_status(tool_name: str, reason: str) -> dict:
    """Create a standardized error dictionary for tool responses."""
    return {"status": {"success": False, "message": f"{tool_name} Error: {reason}"}}


def raise_result_error(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: Any
) -> Optional[Any]:
    """
    Post-execution hook to validate the results of image and video generation tools.

    This hook checks if the number of generated media items matches the number
    requested in the tool's input arguments.

    - For `image_generate`, it calculates the expected number of images based on
      the `tasks` list, considering both single and group generation requests.
    - For `video_generate`, it checks the number of videos requested in the `params` list.

    If a mismatch is found, it returns a formatted error dictionary to halt
    the workflow and notify the user.
    """
    if tool.name == "image_generate":
        try:
            tasks = args.get("tasks", [])
            if not tasks:
                return None  # No tasks to check

            # Calculate the total number of images expected from all tasks
            total_expected_images = 0
            for task in tasks:
                task_type = task.get("task_type", "")
                is_group_task = "group" in task_type
                if is_group_task:
                    total_expected_images += task.get("max_images", 1)
                else:
                    total_expected_images += 1

            logger.debug(f"Expected {total_expected_images} images to be generated.")

            if isinstance(tool_response, dict):
                success_list = tool_response.get("success_list", [])
                actual_images = len(success_list)

                if actual_images != total_expected_images:
                    reason = f"生成的图片总数 ({actual_images}) 与预期 ({total_expected_images}) 不符。"
                    logger.warning(reason)
                    return error_status(tool.name, reason)
            else:
                logger.warning(
                    f"Tool response for {tool.name} is not a dict: {tool_response}"
                )

        except Exception as e:
            logger.error(f"在为 {tool.name} 校验结果时出错: {e}")
        return None

    elif tool.name == "video_generate":
        try:
            params = args.get("params", [])
            if not params:
                return None  # No params to check

            total_expected_videos = len(params)
            logger.debug(f"Expected {total_expected_videos} videos to be generated.")

            if isinstance(tool_response, dict):
                success_list = tool_response.get("success_list", [])
                actual_videos = len(success_list)

                if actual_videos != total_expected_videos:
                    reason = f"生成的视频总数 ({actual_videos}) 与预期 ({total_expected_videos}) 不符。"
                    logger.warning(reason)
                    return error_status(tool.name, reason)
            else:
                logger.warning(
                    f"Tool response for {tool.name} is not a dict: {tool_response}"
                )

        except Exception as e:
            logger.error(f"在为 {tool.name} 校验结果时出错: {e}")
        return None

    return None

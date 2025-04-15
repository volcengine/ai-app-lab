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

from mcp import types

from mcp_server.common.logs import LOG


# handle empty response error
def _handle_empty_response(action_name):
    LOG.error(f"{action_name} returned empty response")
    return [
        types.TextContent(
            type="text",
            text="Error: empty response"
        )
    ]


# handle exception error
def _handle_exception(action_name, error):
    LOG.error(f"Exception when calling {action_name}: {str(error)}")
    return [
        types.TextContent(
            type="text",
            text=f"Error: {str(error)}"
        )
    ]


def handle_error(action_name, error=None):
    """Handle API error response

    Args:
        action_name: API action name
        error: Exception object (optional)

    Returns:
        A list of TextContent objects representing the error in a unified format
    """
    # create a mapping table for handling functions
    handlers = {
        True: lambda: _handle_exception(action_name, error),
        False: lambda: _handle_empty_response(action_name),
    }

    return handlers[error is not None]()

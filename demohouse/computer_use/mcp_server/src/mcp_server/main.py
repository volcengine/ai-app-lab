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
MCP Computer Use Server.

This server provides MCP tools to interact with Computer Use Agent.
"""

import argparse

from mcp_server.common.logs import LOG
from mcp_server.tools import computer
from mcp_server.tools import MCP


def main():
    parser = argparse.ArgumentParser(
        description="Run the Computer Use MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="sse",
        help="Transport protocol to use (sse or stdio)",
    )

    args = parser.parse_args()

    # Run the MCP server
    LOG.info(
        f"Starting Computer Use MCP Server with {args.transport} transport")

    MCP.run(transport=args.transport)


if __name__ == "__main__":
    main()

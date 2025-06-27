#!/usr/bin/env python3
# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import argparse
import logging
import requests
from typing import Dict, Any, Optional, Optional, List
from mcp.server.fastmcp import FastMCP
from volcenginesdkarkruntime import AsyncArk
from mcp_server_ark.config import load_config, ArkConfig

# Create MCP server
mcp = FastMCP("Ark mcp Server", port=int(os.getenv("PORT", "8000")))

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global variables
config: Optional[ArkConfig] = None


async def bot_chat(
    message: str,
):
    """Handle model calling with the configured functions."""

    llm = AsyncArk(api_key=config.ark_api_key)

    bot_response = await llm.bot_chat.completions.create(
        messages=[{"role": "user", "content": message}],
        model=config.ark_bot_id,
    )

    return bot_response.model_dump_json(exclude_none=True)


def link_reader(url_list: List[str]):
    """当你需要获取网页、pdf、抖音视频内容时，使用此工具。可以获取url链接下的标题和内容。

    examples: {"url_list":["abc.com", "xyz.com"]}
    Args:
        url_list: 需要解析网页链接,最多3个,以列表返回
    """
    return _execute_tool(
        config.ark_api_key, "LinkReader", "LinkReader", {"url_list": url_list}
    )


def caculator(input: str):
    """Evaluate a given mathematical expression
    Args:
        input: The mathematical expression in Wolfram Language InputForm
    """
    return _execute_tool(
        config.ark_api_key, "Calculator", "Calculator", {"input": input}
    )


tools_map = {
    "link_reader": link_reader,
    "caculator": caculator,
}


def _execute_tool(
    api_key: str,
    tool_name: str,
    action_name: str,
    parameters: Optional[Dict[str, Any]] = None,
):
    url = "https://ark.cn-beijing.volces.com/api/v3/tools/execute"

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    payload = {
        "action_name": action_name,
        "tool_name": tool_name,
        "parameters": parameters or {},
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raise an exception for HTTP errors
        return response.json().get("data", {})
    except requests.exceptions.RequestException as e:
        logger.error(f"Error executing tool {tool_name}.{action_name}: {str(e)}")
        return {"error": str(e)}


def main():
    """Main entry point for the MCP server."""
    parser = argparse.ArgumentParser(description="Run the TLS MCP Server")
    parser.add_argument(
        "--transport",
        "-t",
        choices=["sse", "stdio"],
        default="stdio",
        help="Transport protocol to use (sse or stdio)",
    )

    args = parser.parse_args()

    try:
        # Load configuration from environment variables
        global config

        config = load_config()
        # Run the MCP server
        logger.info(f"Starting ARK MCP Server with {args.transport} transport")

        if config.ark_bot_id:
            mcp.add_tool(bot_chat, config.ark_bot_name, config.ark_bot_description)
        for tool in config.tools:
            if config.tools[tool]:
                mcp.add_tool(
                    tools_map[tool], tools_map[tool].__name__, tools_map[tool].__doc__
                )
        mcp.run(transport=args.transport)
    except Exception as e:
        logger.error(f"Error starting ARK MCP Server: {str(e)}")
        raise


if __name__ == "__main__":
    main()
